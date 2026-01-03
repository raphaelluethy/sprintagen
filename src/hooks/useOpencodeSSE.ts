import type {
	Event,
	Message,
	Part,
	SessionStatus,
	ToolPart,
} from "@opencode-ai/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export function useOpencodeSSE(
	sessionId: string | null,
	enabled = true,
): UseOpencodeSSEResult {
	const [messagesMap, setMessagesMap] = useState<Map<string, Message>>(
		new Map(),
	);
	const [partsMap, setPartsMap] = useState<Map<string, Part[]>>(new Map());
	const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
		type: "idle",
	});

	const [connectionState, setConnectionState] =
		useState<ConnectionState>("disconnected");
	const [error, setError] = useState<string | null>(null);

	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const reconnectAttemptsRef = useRef(0);

	const SSE_RECONNECT_BASE_MS = 1000;
	const SSE_RECONNECT_MAX_MS = 30000;
	const SSE_MAX_RECONNECT_ATTEMPTS = 5;

	const sessionIdRef = useRef(sessionId);
	sessionIdRef.current = sessionId;

	const cleanup = useCallback(() => {
		if (eventSourceRef.current) {
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
						const updated = [...existing];
						updated[idx] = part;
						next.set(part.messageID, updated);
					} else {
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
				break;
		}
	}, []);

	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;

	const handleEventRef = useRef(handleEvent);
	handleEventRef.current = handleEvent;

	const connect = useCallback(() => {
		const currentSessionId = sessionIdRef.current;
		if (!currentSessionId || !enabledRef.current) return;

		cleanup();

		const url = `/api/opencode/events?sessionId=${encodeURIComponent(currentSessionId)}`;
		setConnectionState("connecting");
		setError(null);

		const eventSource = new EventSource(url);
		eventSourceRef.current = eventSource;

		eventSource.onopen = () => {
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
					return;
				}

				if (event.type === "error") {
					setError(event.error);
					return;
				}

				handleEventRef.current(event as Event);
			} catch (err) {
				console.error("[useOpencodeSSE] Failed to parse event:", err);
			}
		};

		eventSource.onerror = () => {
			setConnectionState("error");
			setError("Connection lost");

			eventSource.close();
			eventSourceRef.current = null;

			if (reconnectAttemptsRef.current < SSE_MAX_RECONNECT_ATTEMPTS) {
				const delay = Math.min(
					SSE_RECONNECT_BASE_MS * 2 ** reconnectAttemptsRef.current,
					SSE_RECONNECT_MAX_MS,
				);

				reconnectTimeoutRef.current = setTimeout(() => {
					reconnectAttemptsRef.current++;
					connect();
				}, delay);
			} else {
				setConnectionState("error");
			}
		};
	}, [cleanup]);

	useEffect(() => {
		if (sessionId && enabled) {
			setMessagesMap(new Map());
			setPartsMap(new Map());
			setSessionStatus({ type: "idle" });
			setError(null);
			reconnectAttemptsRef.current = 0;

			queueMicrotask(() => {
				connect();
			});
		} else {
			cleanup();
			setConnectionState("disconnected");
		}

		return () => {
			cleanup();
		};
	}, [sessionId, enabled, connect, cleanup]);

	const messages: MessageWithParts[] = useMemo(
		() =>
			Array.from(messagesMap.values())
				.sort((a, b) => {
					const aTime = (a.time as { created?: number })?.created ?? 0;
					const bTime = (b.time as { created?: number })?.created ?? 0;
					return aTime - bTime;
				})
				.map((info) => ({
					info,
					parts: partsMap.get(info.id) ?? [],
				})),
		[messagesMap, partsMap],
	);

	const toolCalls: ToolPart[] = useMemo(
		() =>
			messages.flatMap((m) =>
				m.parts.filter((p): p is ToolPart => p.type === "tool"),
			),
		[messages],
	);

	const status: "pending" | "running" | "completed" | "error" = useMemo(() => {
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
	}, [error, connectionState, sessionStatus.type, messages.length]);

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
