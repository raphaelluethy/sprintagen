import { useEffect, useRef, useState } from "react";
import type { OpencodeChatMessage, ToolPart } from "@/server/tickets/opencode";

interface SessionState {
	messages: OpencodeChatMessage[];
	toolCalls: ToolPart[];
	status: "pending" | "running" | "completed" | "error";
	error?: string;
}

interface UseOpencodeStreamResult {
	messages: OpencodeChatMessage[];
	toolCalls: ToolPart[];
	status: "pending" | "running" | "completed" | "error";
	error: string | null;
	isConnected: boolean;
}

/**
 * Hook to connect to SSE stream for OpenCode session updates
 */
export function useOpencodeStream(
	sessionId: string | null,
): UseOpencodeStreamResult {
	const [state, setState] = useState<SessionState>({
		messages: [],
		toolCalls: [],
		status: "pending",
	});
	const [error, setError] = useState<string | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectAttempts = useRef(0);
	const maxReconnectAttempts = 5;

	useEffect(() => {
		if (!sessionId) {
			// Reset state when sessionId is cleared
			setState({
				messages: [],
				toolCalls: [],
				status: "pending",
			});
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
					const data = JSON.parse(event.data);

					if (data.type === "init") {
						// Initial state
						if (data.state) {
							setState({
								messages: data.state.messages || [],
								toolCalls: data.state.currentToolCalls || [],
								status: data.state.status || "pending",
								error: data.state.error,
							});
						}
					} else if (data.type === "update") {
						// Update state
						if (data.state) {
							setState((prev) => ({
								messages: data.state.messages || prev.messages,
								toolCalls: data.state.currentToolCalls || prev.toolCalls,
								status: data.state.status || prev.status,
								error: data.state.error,
							}));
						}
					} else if (data.type === "complete") {
						// Session completed
						if (data.state) {
							setState({
								messages: data.state.messages || [],
								toolCalls: [],
								status: data.state.status === "error" ? "error" : "completed",
								error: data.state.error,
							});
						}
						// Close connection after completion
						setTimeout(() => {
							eventSource.close();
							setIsConnected(false);
						}, 1000);
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
					const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 10000); // Exponential backoff, max 10s
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
	}, [sessionId]);

	return {
		messages: state.messages,
		toolCalls: state.toolCalls,
		status: state.status,
		error: error || state.error || null,
		isConnected,
	};
}
