import type {
	Event,
	Message,
	Part,
	SessionStatus,
	ToolPart,
} from "@opencode-ai/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * SDK Event types we care about
 */
type SdkEvent =
	| { type: "message.updated"; properties: { info: Message } }
	| { type: "message.part.updated"; properties: { part: Part; delta?: string } }
	| {
			type: "session.status";
			properties: { sessionID: string; status: SessionStatus };
	  }
	| { type: "session.idle"; properties: { sessionID: string } }
	| Event;

/**
 * Message with parts combined
 */
interface MessageWithParts {
	info: Message;
	parts: Part[];
}

/**
 * Session state from the store
 */
interface SessionState {
	sessionId: string;
	ticketId?: string;
	sessionType: "chat" | "ask" | "admin";
	status: string;
	messages: MessageWithParts[];
	currentToolCalls: ToolPart[];
	startedAt?: number;
	updatedAt?: number;
}

/**
 * Stream event from SSE
 */
interface StreamEvent {
	type: "init" | "event" | "error";
	state?: SessionState;
	directory?: string;
	event?: SdkEvent;
	error?: string;
}

interface UseOpencodeStreamResult {
	messages: MessageWithParts[];
	toolCalls: ToolPart[];
	/** Legacy status string for backward compatibility */
	status: "pending" | "running" | "completed" | "error";
	/** SDK SessionStatus object */
	sessionStatus: SessionStatus;
	error: string | null;
	isConnected: boolean;
}

/**
 * Hook to connect to SSE stream for OpenCode session updates
 * Uses the new event-driven architecture with SDK event types
 */
export function useOpencodeStream(
	sessionId: string | null,
): UseOpencodeStreamResult {
	const [messages, setMessages] = useState<MessageWithParts[]>([]);
	const [status, setStatus] = useState<SessionStatus>({ type: "idle" });
	const [error, setError] = useState<string | null>(null);
	const [isConnected, setIsConnected] = useState(false);

	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectAttempts = useRef(0);
	const maxReconnectAttempts = 5;
	const pendingPartsRef = useRef<Record<string, Part[]>>({});

	const toolCalls = useMemo(
		() =>
			messages
				.flatMap((m) => m.parts)
				.filter(
					(part): part is ToolPart =>
						part.type === "tool" &&
						(part.state.status === "pending" ||
							part.state.status === "running"),
				),
		[messages],
	);

	const applyPartUpdate = useCallback(
		(parts: Part[], incoming: Part & { delta?: string }): Part[] => {
			const { delta, ...incomingRest } = incoming as Part & { delta?: string };
			const idx = parts.findIndex((p) => p.id === incomingRest.id);

			if (idx >= 0) {
				const existing = parts[idx];
				if (!existing) return parts;
				if (existing.type === "text") {
					const baseText =
						(existing as { text?: string }).text ??
						(incomingRest as { text?: string }).text ??
						"";
					const text =
						delta !== undefined
							? `${baseText}${delta}`
							: ((incomingRest as { text?: string }).text ?? baseText);
					const merged = { ...existing, ...incomingRest, text } as Part;
					const next = [...parts];
					next[idx] = merged;
					return next;
				}

				const merged = { ...existing, ...incomingRest } as Part;
				const next = [...parts];
				next[idx] = merged;
				return next;
			}

			let newPart: Part = incomingRest as Part;
			if (incomingRest.type === "text") {
				const baseText = (incomingRest as { text?: string }).text ?? "";
				const text = delta !== undefined ? `${baseText}${delta}` : baseText;
				newPart = { ...incomingRest, text } as Part;
			}

			const next = [...parts, newPart];
			next.sort((a, b) => a.id.localeCompare(b.id));
			return next;
		},
		[],
	);

	/**
	 * Handle incoming SDK events
	 */
	const handleEvent = useCallback(
		(event: SdkEvent) => {
			switch (event.type) {
				case "message.updated": {
					const msg = event.properties.info;
					setMessages((prev) => {
						const idx = prev.findIndex((m) => m.info.id === msg.id);
						const queued = pendingPartsRef.current[msg.id];

						if (idx >= 0) {
							const updated = [...prev];
							const existing = {
								...updated[idx],
								info: msg,
							} as MessageWithParts;
							let parts = existing.parts ?? [];
							if (queued && queued.length > 0) {
								parts = queued.reduce(
									(acc, part) => applyPartUpdate(acc, part),
									parts,
								);
								delete pendingPartsRef.current[msg.id];
							}
							updated[idx] = { ...existing, parts };
							return updated;
						}

						let initialParts: Part[] = queued ?? [];
						if (queued) {
							delete pendingPartsRef.current[msg.id];
						}

						return [...prev, { info: msg, parts: initialParts }].sort((a, b) =>
							a.info.id.localeCompare(b.info.id),
						);
					});
					break;
				}

				case "message.part.updated": {
					const deltaFromEvent = (event.properties as { delta?: string }).delta;
					const deltaFromPart = (event.properties.part as { delta?: string })
						.delta;
					const incomingPart = {
						...event.properties.part,
						...(deltaFromEvent !== undefined
							? { delta: deltaFromEvent }
							: deltaFromPart !== undefined
								? { delta: deltaFromPart }
								: {}),
					} as Part & { delta?: string };
					setMessages((prev) => {
						const msgIdx = prev.findIndex(
							(m) => m.info.id === incomingPart.messageID,
						);
						if (msgIdx < 0) {
							const existingQueue =
								pendingPartsRef.current[incomingPart.messageID] ?? [];
							pendingPartsRef.current[incomingPart.messageID] = applyPartUpdate(
								existingQueue,
								incomingPart,
							);
							return prev;
						}

						const updated = [...prev];
						const msg = { ...updated[msgIdx] } as MessageWithParts;
						msg.parts = applyPartUpdate(msg.parts ?? [], incomingPart);
						updated[msgIdx] = msg;
						return updated;
					});
					break;
				}

				case "session.status": {
					setStatus(event.properties.status);
					break;
				}

				case "session.idle": {
					setStatus({ type: "idle" });
					break;
				}

				default:
					// Other events can be handled as needed
					break;
			}
		},
		[applyPartUpdate],
	);

	useEffect(() => {
		if (!sessionId) {
			// Reset state when sessionId is cleared
			setMessages([]);
			setStatus({ type: "idle" });
			setError(null);
			setIsConnected(false);
			return;
		}

		const connect = () => {
			// Clean up existing connection
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
			}

			const url = `/api/opencode/sessions/${sessionId}/stream`;
			const eventSource = new EventSource(url);

			eventSource.onopen = () => {
				console.log(`[SSE] Connected to session ${sessionId}`);
				setIsConnected(true);
				setError(null);
				reconnectAttempts.current = 0;
			};

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data) as StreamEvent;

					if (data.type === "init") {
						// Initial state from store
						if (data.state) {
							setMessages(data.state.messages || []);
							// Convert status string to SessionStatus
							const statusType = data.state.status as "idle" | "busy" | "retry";
							if (statusType === "busy") {
								setStatus({ type: "busy" });
							} else if (statusType === "retry") {
								setStatus({ type: "retry", attempt: 0, message: "", next: 0 });
							} else {
								setStatus({ type: "idle" });
							}
						}
					} else if (data.type === "event" && data.event) {
						// SDK event
						handleEvent(data.event);
					} else if (data.type === "error") {
						setError(data.error || "Unknown error");
					}
				} catch (err) {
					console.error("[SSE] Error parsing message:", err);
					setError("Failed to parse server message");
				}
			};

			eventSource.onerror = (err) => {
				console.error(`[SSE] Error for session ${sessionId}:`, err);
				setIsConnected(false);

				// Attempt to reconnect
				if (reconnectAttempts.current < maxReconnectAttempts) {
					reconnectAttempts.current++;
					const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 10000);
					console.log(
						`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`,
					);

					reconnectTimeoutRef.current = setTimeout(() => {
						connect();
					}, delay);
				} else {
					setError("Failed to connect to session stream");
					eventSource.close();
				}
			};

			eventSourceRef.current = eventSource;
		};

		connect();

		// Cleanup on unmount or sessionId change
		return () => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
			setIsConnected(false);
		};
	}, [sessionId, handleEvent]);

	// Convert SessionStatus to legacy status string
	const legacyStatus = useMemo(():
		| "pending"
		| "running"
		| "completed"
		| "error" => {
		if (error) return "error";
		switch (status.type) {
			case "busy":
				return "running";
			case "retry":
				return "running";
			case "idle":
				// If we have messages and status is idle, it's completed
				return messages.length > 0 ? "completed" : "pending";
			default:
				return "pending";
		}
	}, [status, error, messages.length]);

	return {
		messages,
		toolCalls,
		status: legacyStatus,
		sessionStatus: status,
		error,
		isConnected,
	};
}

/**
 * Hook to get transformed messages for display
 * Converts SDK format to the legacy OpencodeChatMessage format for backward compatibility
 */
export function useOpencodeMessages(sessionId: string | null) {
	const { messages, toolCalls, status, sessionStatus, error, isConnected } =
		useOpencodeStream(sessionId);

	// Transform to legacy format - memoized to prevent unnecessary re-renders
	const transformedMessages = useMemo(
		() =>
			messages.map((m) => {
				const textParts = m.parts
					.filter(
						(p): p is Extract<Part, { type: "text" }> => p.type === "text",
					)
					.map((p) => p.text);

				const stepFinishParts = m.parts
					.filter(
						(p): p is Extract<Part, { type: "step-finish" }> =>
							p.type === "step-finish",
					)
					.map((p) => p.reason);

				const reasoningParts = m.parts
					.filter(
						(p): p is Extract<Part, { type: "reasoning" }> =>
							p.type === "reasoning",
					)
					.map((p) => p.text);

				const time = m.info.time as { created?: number; completed?: number };

				return {
					id: m.info.id,
					role: m.info.role,
					text: [...textParts, ...stepFinishParts].join("\n"),
					createdAt: new Date(time.created ?? Date.now()),
					model:
						"providerID" in m.info && "modelID" in m.info
							? `${m.info.providerID}/${m.info.modelID}`
							: undefined,
					toolCalls: m.parts
						.filter((p): p is ToolPart => p.type === "tool")
						.map((p) => ({ toolName: p.tool, toolCallId: p.callID })),
					parts: m.parts,
					reasoning: reasoningParts.join("\n").trim() || undefined,
					sessionId: m.info.sessionID,
				};
			}),
		[messages],
	);

	return {
		messages: transformedMessages,
		toolCalls,
		status,
		sessionStatus,
		error,
		isConnected,
	};
}
