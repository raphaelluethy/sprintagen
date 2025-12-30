import type {
	Event,
	Message,
	Part,
	SessionStatus,
	ToolPart,
} from "@opencode-ai/sdk";
import { useCallback, useEffect, useRef, useState } from "react";

interface MessageWithParts {
	info: Message;
	parts: Part[];
}

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

interface UseOpencodeSSEResult {
	messages: MessageWithParts[];
	toolCalls: ToolPart[];
	/** Legacy status string for backward compatibility */
	status: "pending" | "running" | "completed" | "error";
	/** SDK SessionStatus object */
	sessionStatus: SessionStatus;
	error: string | null;
	isConnected: boolean;
	connectionState: ConnectionState;
}

/**
 * Hook for real-time OpenCode session updates via SSE.
 * Replaces useOpencodeStream polling hook.
 */
export function useOpencodeSSE(
	sessionId: string | null,
	enabled = true,
): UseOpencodeSSEResult {
	// State for messages and parts
	const [messagesMap, setMessagesMap] = useState<Map<string, Message>>(
		new Map(),
	);
	const [partsMap, setPartsMap] = useState<Map<string, Part[]>>(new Map());
	const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
		type: "idle",
	});

	// Connection state
	const [connectionState, setConnectionState] =
		useState<ConnectionState>("disconnected");
	const [error, setError] = useState<string | null>(null);

	// EventSource ref
	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const reconnectAttemptsRef = useRef(0);

	// Use ref to store sessionId for logging without causing re-renders
	const sessionIdRef = useRef(sessionId);
	sessionIdRef.current = sessionId;

	const cleanup = useCallback(() => {
		if (eventSourceRef.current) {
			console.log(
				`[useOpencodeSSE] Closing EventSource for session ${sessionIdRef.current}`,
			);
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
	}, []);

	const handleEvent = useCallback((event: Event) => {
		switch (event.type) {
			case "message.updated": {
				const msg = event.properties.info;
				setMessagesMap((prev) => {
					const next = new Map(prev);
					next.set(msg.id, msg);
					return next;
				});
				break;
			}

			case "message.part.updated": {
				const part = event.properties.part;
				setPartsMap((prev) => {
					const next = new Map(prev);
					const existing = next.get(part.messageID) ?? [];
					const idx = existing.findIndex((p) => p.id === part.id);

					if (idx >= 0) {
						// Update existing part
						const updated = [...existing];
						updated[idx] = part;
						next.set(part.messageID, updated);
					} else {
						// Add new part
						next.set(part.messageID, [...existing, part]);
					}
					return next;
				});
				break;
			}

			case "session.status": {
				setSessionStatus(event.properties.status);
				break;
			}

			case "session.idle": {
				setSessionStatus({ type: "idle" });
				break;
			}

			case "session.error": {
				const err = event.properties.error;
				const errorMessage =
					err && "message" in err
						? (err as { message: string }).message
						: "Session error";
				setError(errorMessage);
				break;
			}

			default:
				// Ignore other event types
				break;
		}
	}, []);

	// Store enabled in ref to avoid dependency issues
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;

	// Store handleEvent in ref to avoid recreating connect
	const handleEventRef = useRef(handleEvent);
	handleEventRef.current = handleEvent;

	const connect = useCallback(() => {
		const currentSessionId = sessionIdRef.current;
		if (!currentSessionId || !enabledRef.current) return;

		cleanup();

		setConnectionState("connecting");
		setError(null);

		const url = `/api/opencode/events?sessionId=${encodeURIComponent(currentSessionId)}`;
		console.log(`[useOpencodeSSE] Connecting to ${url}`);

		const eventSource = new EventSource(url);
		eventSourceRef.current = eventSource;

		eventSource.onopen = () => {
			console.log(`[useOpencodeSSE] Connected to session ${currentSessionId}`);
			setConnectionState("connected");
			setError(null);
			reconnectAttemptsRef.current = 0;
		};

		eventSource.onmessage = (e) => {
			try {
				const event = JSON.parse(e.data) as
					| Event
					| { type: "connected"; sessionId: string }
					| { type: "error"; error: string };

				if (event.type === "connected") {
					console.log("[useOpencodeSSE] Received connection confirmation");
					return;
				}

				if (event.type === "error") {
					console.error("[useOpencodeSSE] Server error:", event.error);
					setError(event.error);
					return;
				}

				// Handle OpenCode events
				handleEventRef.current(event as Event);
			} catch (err) {
				console.error("[useOpencodeSSE] Failed to parse event:", err);
			}
		};

		eventSource.onerror = () => {
			console.error(
				`[useOpencodeSSE] EventSource error for session ${currentSessionId}`,
			);
			setConnectionState("error");
			setError("Connection lost");

			// Close the failed connection
			eventSource.close();
			eventSourceRef.current = null;

			// Exponential backoff reconnection
			const maxAttempts = 5;
			if (reconnectAttemptsRef.current < maxAttempts) {
				const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
				console.log(
					`[useOpencodeSSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxAttempts})`,
				);

				reconnectTimeoutRef.current = setTimeout(() => {
					reconnectAttemptsRef.current++;
					connect();
				}, delay);
			} else {
				console.error("[useOpencodeSSE] Max reconnection attempts reached");
				setConnectionState("error");
			}
		};
	}, [cleanup]);

	// Connect when sessionId changes or enabled changes
	useEffect(() => {
		if (sessionId && enabled) {
			// Reset state when sessionId changes
			setMessagesMap(new Map());
			setPartsMap(new Map());
			setSessionStatus({ type: "idle" });
			setError(null);
			reconnectAttemptsRef.current = 0;
			connect();
		} else {
			cleanup();
			setConnectionState("disconnected");
		}

		return () => {
			cleanup();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId, enabled]);

	// Derive messages with parts
	const messages: MessageWithParts[] = Array.from(messagesMap.values())
		.sort((a, b) => {
			const aTime = (a.time as { created?: number })?.created ?? 0;
			const bTime = (b.time as { created?: number })?.created ?? 0;
			return aTime - bTime;
		})
		.map((info) => ({
			info,
			parts: partsMap.get(info.id) ?? [],
		}));

	// Extract tool calls from all parts
	const toolCalls: ToolPart[] = messages.flatMap((m) =>
		m.parts.filter((p): p is ToolPart => p.type === "tool"),
	);

	// Derive legacy status
	const status: "pending" | "running" | "completed" | "error" = (() => {
		if (error) return "error";
		if (connectionState === "connecting") return "pending";

		switch (sessionStatus.type) {
			case "busy":
			case "retry":
				return "running";
			case "idle":
				return messages.length > 0 ? "completed" : "pending";
			default:
				return "pending";
		}
	})();

	return {
		messages,
		toolCalls,
		status,
		sessionStatus,
		error,
		isConnected: connectionState === "connected",
		connectionState,
	};
}
