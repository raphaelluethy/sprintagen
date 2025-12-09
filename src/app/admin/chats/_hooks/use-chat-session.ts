"use client";

import { useCallback, useEffect, useState } from "react";
import type { Message, Part } from "@opencode-ai/sdk";
import { createDebugLogger } from "@/lib/debug-logger";
import type { MessageWithParts } from "@/lib/opencode-utils";
import type { Session } from "../_components/sessions-sidebar";

const log = createDebugLogger("Chat");

interface UseChatSessionOptions {
	modelConfig: {
		providerID: string;
		modelID: string;
	};
}

interface UseChatSessionResult {
	sessions: Session[];
	selectedSessionId: string | null;
	setSelectedSessionId: (id: string | null) => void;
	messages: MessageWithParts[];
	isLoading: boolean;
	isSending: boolean;
	error: string | null;
	healthStatus: "checking" | "healthy" | "unhealthy";
	authStatus: string | null;
	newMessage: string;
	setNewMessage: (value: string) => void;
	createSession: () => Promise<void>;
	sendMessage: () => Promise<void>;
}

export function useChatSession({
	modelConfig,
}: UseChatSessionOptions): UseChatSessionResult {
	const [sessions, setSessions] = useState<Session[]>([]);
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
		null,
	);
	const [messages, setMessages] = useState<MessageWithParts[]>([]);
	const [newMessage, setNewMessage] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [healthStatus, setHealthStatus] = useState<
		"checking" | "healthy" | "unhealthy"
	>("checking");
	const [authStatus, setAuthStatus] = useState<string | null>(null);

	// Check health and configure auth on mount
	useEffect(() => {
		async function initialize() {
			log.info("Initializing...");

			try {
				log.info("Checking health at /api/opencode/health");
				const healthRes = await fetch("/api/opencode/health");

				if (!healthRes.ok) {
					log.warn(`Health check failed: ${healthRes.status}`);
					setHealthStatus("unhealthy");
					return;
				}

				const healthData = await healthRes.json();
				log.debug("Health response", healthData);

				const isHealthy = healthData.status === "healthy";
				setHealthStatus(isHealthy ? "healthy" : "unhealthy");

				if (isHealthy) {
					log.success("Server healthy");

					log.info("Fetching auth config...");
					const authRes = await fetch("/api/opencode/auth");
					if (authRes.ok) {
						const authData = await authRes.json();
						log.debug("Auth response", authData);

						if (authData.configured) {
							log.success(
								`Authenticated with provider: ${authData.providerId}`,
							);
							setAuthStatus(`Authenticated: ${authData.providerId}`);
						} else if (authData.error) {
							log.warn(`Auth error: ${authData.error}`);
							setAuthStatus(`Auth error: ${authData.error}`);
						} else {
							log.info("No auth configured");
						}
					} else {
						log.warn(`Auth fetch failed: ${authRes.status}`);
					}
				} else {
					log.warn(
						`Server unhealthy: ${healthData.message || healthData.status}`,
					);
				}
			} catch (err) {
				log.error("Initialization failed", err);
				setHealthStatus("unhealthy");
			}
		}
		initialize();
	}, []);

	// Fetch sessions
	const fetchSessions = useCallback(async () => {
		log.info("Fetching sessions...");
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/opencode/sessions");
			if (!res.ok) {
				throw new Error(`Failed to fetch sessions: ${res.status}`);
			}
			const data = await res.json();
			log.debug("Sessions response", data);
			const sessionList = Array.isArray(data) ? data : data.sessions || [];
			log.success(`Loaded ${sessionList.length} sessions`);
			setSessions(sessionList);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to fetch sessions";
			log.error("Fetch sessions failed", err);
			setError(message);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (healthStatus === "healthy") {
			fetchSessions();
		}
	}, [healthStatus, fetchSessions]);

	// Fetch messages for selected session
	const fetchMessages = useCallback(async (sessionId: string) => {
		log.info(`Fetching messages for session ${sessionId.slice(0, 8)}...`);
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/opencode/sessions/${sessionId}/messages`);
			if (!res.ok) {
				throw new Error(`Failed to fetch messages: ${res.status}`);
			}
			const data = await res.json();
			log.debug("Messages response", data);
			const messageList: MessageWithParts[] = Array.isArray(data)
				? data
				: data.messages || [];
			log.success(`Loaded ${messageList.length} messages`);
			setMessages(messageList);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to fetch messages";
			log.error("Fetch messages failed", err);
			setError(message);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (selectedSessionId) {
			log.info(`Selected session: ${selectedSessionId.slice(0, 8)}`);
			fetchMessages(selectedSessionId);
		}
	}, [selectedSessionId, fetchMessages]);

	// Create new session
	const createSession = useCallback(async () => {
		log.info("Creating new session...");
		setIsLoading(true);
		setError(null);
		try {
			const title = `Session ${new Date().toLocaleString()}`;
			log.debug("Session payload", { title });
			const res = await fetch("/api/opencode/sessions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title }),
			});
			if (!res.ok) {
				throw new Error(`Failed to create session: ${res.status}`);
			}
			const newSession = await res.json();
			log.success(`Created session: ${newSession.id}`);
			log.debug("New session", newSession);
			await fetchSessions();
			setSelectedSessionId(newSession.id);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to create session";
			log.error("Create session failed", err);
			setError(message);
		} finally {
			setIsLoading(false);
		}
	}, [fetchSessions]);

	// Send message
	const sendMessage = useCallback(async () => {
		if (!selectedSessionId || !newMessage.trim()) return;

		const messageText = newMessage.trim();
		log.info(`Sending message to session ${selectedSessionId.slice(0, 8)}...`);

		const payload = {
			agent: "docs-agent",
			parts: [
				{
					type: "text",
					text: messageText,
				},
			],
			model: {
				providerID: modelConfig.providerID,
				modelID: modelConfig.modelID,
			},
		};
		console.log("[OPENCODE] Message payload", payload);
		log.debug("Message payload", {
			text: messageText.slice(0, 100) + (messageText.length > 100 ? "..." : ""),
		});

		setIsSending(true);
		setError(null);
		try {
			const res = await fetch(
				`/api/opencode/sessions/${selectedSessionId}/messages`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				},
			);
			if (!res.ok) {
				const errorBody = await res.text();
				log.error(`Send failed with status ${res.status}`, errorBody);
				throw new Error(`Failed to send message: ${res.status}`);
			}
			const responseData = await res.json();
			log.success("Message sent");
			log.debug("Send response", responseData);
			setNewMessage("");
			await fetchMessages(selectedSessionId);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to send message";
			log.error("Send message failed", err);
			setError(message);
		} finally {
			setIsSending(false);
		}
	}, [selectedSessionId, newMessage, modelConfig, fetchMessages]);

	return {
		sessions,
		selectedSessionId,
		setSelectedSessionId,
		messages,
		isLoading,
		isSending,
		error,
		healthStatus,
		authStatus,
		newMessage,
		setNewMessage,
		createSession,
		sendMessage,
	};
}
