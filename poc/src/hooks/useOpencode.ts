import { useState, useEffect, useCallback } from "react";
import type { Session, Message, Part, Event } from "../types";

interface OpencodeState {
	session: Session | null;
	messages: Array<{ info: Message; parts: Part[] }>;
	isLoading: boolean;
	error: string | null;
	sessionStatus: "idle" | "running" | "error";
}

export function useOpencode() {
	const [state, setState] = useState<OpencodeState>({
		session: null,
		messages: [],
		isLoading: false,
		error: null,
		sessionStatus: "idle",
	});

	// Create a new session
	const createSession = useCallback(async () => {
		setState((prev) => ({ ...prev, isLoading: true, error: null }));
		try {
			const response = await fetch("/api/session/create", {
				method: "POST",
			});
			if (!response.ok) throw new Error("Failed to create session");
			const session = await response.json();
			setState((prev) => ({ ...prev, session, isLoading: false }));
			return session;
		} catch (error) {
			setState((prev) => ({
				...prev,
				error: (error as Error).message,
				isLoading: false,
			}));
			return null;
		}
	}, []);

	// Send a prompt
	const sendPrompt = useCallback(
		async (text: string) => {
			if (!state.session) return;

			setState((prev) => ({
				...prev,
				isLoading: true,
				error: null,
				sessionStatus: "running",
			}));

			try {
				const response = await fetch(
					`/api/session/${state.session.id}/prompt`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							parts: [{ type: "text", text }],
						}),
					},
				);

				if (!response.ok) throw new Error("Failed to send prompt");

				// Fetch updated messages
				await fetchMessages();
			} catch (error) {
				setState((prev) => ({
					...prev,
					error: (error as Error).message,
					isLoading: false,
					sessionStatus: "error",
				}));
			}
		},
		[state.session],
	);

	// Fetch messages for the current session
	const fetchMessages = useCallback(async () => {
		if (!state.session) return;

		try {
			const response = await fetch(`/api/session/${state.session.id}/messages`);
			if (!response.ok) throw new Error("Failed to fetch messages");
			const messages = await response.json();
			setState((prev) => ({ ...prev, messages, isLoading: false }));
		} catch (error) {
			setState((prev) => ({
				...prev,
				error: (error as Error).message,
				isLoading: false,
			}));
		}
	}, [state.session]);

	// Set up SSE for real-time events
	useEffect(() => {
		if (!state.session) return;

		const eventSource = new EventSource("/api/events");

		eventSource.onmessage = (event) => {
			const data: Event = JSON.parse(event.data);

			// Handle different event types
			if (
				data.type === "message.updated" ||
				data.type === "message.part.updated"
			) {
				// Refetch messages when updates occur
				fetchMessages();
			} else if (data.type === "session.status") {
				// Update session status
				const status = (data.properties as any)?.status;
				if (
					status?.type === "idle" ||
					status?.type === "running" ||
					status?.type === "error"
				) {
					setState((prev) => ({
						...prev,
						sessionStatus: status.type,
					}));
				}
			}
		};

		eventSource.onerror = () => {
			console.error("SSE connection error");
			eventSource.close();
		};

		return () => {
			eventSource.close();
		};
	}, [state.session, fetchMessages]);

	return {
		...state,
		createSession,
		sendPrompt,
		fetchMessages,
	};
}
