"use client";

import { useCallback, useEffect, useState } from "react";

interface Session {
	id: string;
	title?: string;
	createdAt?: string;
}

interface Message {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt?: string;
}

interface Provider {
	id: string;
	name: string;
	models?: { id: string; name: string }[];
}

export default function AdminChatsPage() {
	const [sessions, setSessions] = useState<Session[]>([]);
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
		null,
	);
	const [messages, setMessages] = useState<Message[]>([]);
	const [newMessage, setNewMessage] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [healthStatus, setHealthStatus] = useState<
		"checking" | "healthy" | "unhealthy"
	>("checking");
	const [authStatus, setAuthStatus] = useState<string | null>(null);
	const [providers, setProviders] = useState<Provider[]>([]);
	const [selectedProvider, setSelectedProvider] = useState<string>("anthropic");
	const [selectedModel, setSelectedModel] = useState<string>(
		"claude-sonnet-4-20250514",
	);

	// Check health and configure auth on mount
	useEffect(() => {
		async function initialize() {
			// Check health
			try {
				const healthRes = await fetch("/api/opencode/health");
				const healthData = await healthRes.json();
				setHealthStatus(
					healthData.status === "healthy" ? "healthy" : "unhealthy",
				);

				if (healthData.status === "healthy") {
					// Auto-configure auth from env vars
					const authRes = await fetch("/api/opencode/auth");
					const authData = await authRes.json();
					if (authData.configured) {
						setAuthStatus(`Authenticated: ${authData.providerId}`);
						setSelectedProvider(authData.providerId);
					} else if (authData.error) {
						setAuthStatus(`Auth error: ${authData.error}`);
					}

					// Fetch providers
					const providersRes = await fetch("/api/opencode/providers");
					if (providersRes.ok) {
						const providersData = await providersRes.json();
						if (Array.isArray(providersData)) {
							setProviders(providersData);
						}
					}
				}
			} catch {
				setHealthStatus("unhealthy");
			}
		}
		initialize();
	}, []);

	// Fetch sessions
	const fetchSessions = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/opencode/sessions");
			if (!res.ok) {
				throw new Error(`Failed to fetch sessions: ${res.status}`);
			}
			const data = await res.json();
			const sessionList = Array.isArray(data) ? data : data.sessions || [];
			setSessions(sessionList);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch sessions");
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
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/opencode/sessions/${sessionId}/messages`);
			if (!res.ok) {
				throw new Error(`Failed to fetch messages: ${res.status}`);
			}
			const data = await res.json();
			const messageList = Array.isArray(data) ? data : data.messages || [];
			setMessages(messageList);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch messages");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (selectedSessionId) {
			fetchMessages(selectedSessionId);
		}
	}, [selectedSessionId, fetchMessages]);

	// Create new session
	const createSession = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/opencode/sessions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: `Session ${new Date().toLocaleString()}`,
				}),
			});
			if (!res.ok) {
				throw new Error(`Failed to create session: ${res.status}`);
			}
			const newSession = await res.json();
			await fetchSessions();
			setSelectedSessionId(newSession.id);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create session");
		} finally {
			setIsLoading(false);
		}
	};

	// Send message
	const sendMessage = async () => {
		if (!selectedSessionId || !newMessage.trim()) return;

		setIsSending(true);
		setError(null);
		try {
			const res = await fetch(
				`/api/opencode/sessions/${selectedSessionId}/messages`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						text: newMessage,
						providerID: selectedProvider,
						modelID: selectedModel,
					}),
				},
			);
			if (!res.ok) {
				throw new Error(`Failed to send message: ${res.status}`);
			}
			setNewMessage("");
			await fetchMessages(selectedSessionId);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send message");
		} finally {
			setIsSending(false);
		}
	};

	const formatTimestamp = (timestamp?: string) => {
		if (!timestamp) return "";
		try {
			return new Date(timestamp).toLocaleString();
		} catch {
			return timestamp;
		}
	};

	return (
		<div className="min-h-screen bg-[#0a0a0f] text-[#e4e4e7]">
			{/* Header */}
			<header className="border-[#27272a] border-b bg-[#0f0f14]/80 backdrop-blur-sm">
				<div className="container mx-auto flex items-center justify-between px-6 py-4">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
							<svg
								aria-hidden="true"
								className="h-5 w-5 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
								/>
							</svg>
						</div>
						<h1 className="font-semibold text-xl tracking-tight">
							Opencode Chat
						</h1>
					</div>
					<div className="flex items-center gap-4">
						{authStatus && (
							<span className="text-[#71717a] text-xs">{authStatus}</span>
						)}
						<span
							className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-medium text-xs ${
								healthStatus === "healthy"
									? "bg-emerald-500/10 text-emerald-400"
									: healthStatus === "unhealthy"
										? "bg-red-500/10 text-red-400"
										: "bg-yellow-500/10 text-yellow-400"
							}`}
						>
							<span
								className={`h-2 w-2 rounded-full ${
									healthStatus === "healthy"
										? "bg-emerald-400"
										: healthStatus === "unhealthy"
											? "bg-red-400"
											: "animate-pulse bg-yellow-400"
								}`}
							/>
							{healthStatus === "checking"
								? "Connecting..."
								: healthStatus === "healthy"
									? "Connected"
									: "Disconnected"}
						</span>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<div className="flex h-[calc(100vh-73px)]">
				{/* Sidebar - Sessions List */}
				<aside className="w-80 flex-shrink-0 border-[#27272a] border-r bg-[#0f0f14]/50">
					<div className="flex h-full flex-col">
						<div className="border-[#27272a] border-b p-4">
							<button
								className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 font-medium text-sm text-white transition-all hover:from-emerald-600 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={isLoading || healthStatus !== "healthy"}
								onClick={createSession}
								type="button"
							>
								<svg
									aria-hidden="true"
									className="h-4 w-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M12 4v16m8-8H4"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
									/>
								</svg>
								New Session
							</button>
						</div>

						<div className="flex-1 overflow-y-auto p-2">
							{sessions.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-12 text-center">
									<div className="mb-3 rounded-full bg-[#27272a] p-3">
										<svg
											aria-hidden="true"
											className="h-6 w-6 text-[#71717a]"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
											/>
										</svg>
									</div>
									<p className="text-[#71717a] text-sm">No sessions yet</p>
									<p className="text-[#52525b] text-xs">
										Create one to get started
									</p>
								</div>
							) : (
								<div className="space-y-1">
									{sessions.map((session) => (
										<button
											className={`w-full rounded-lg p-3 text-left transition-all ${
												selectedSessionId === session.id
													? "bg-emerald-500/10 text-emerald-400"
													: "text-[#a1a1aa] hover:bg-[#27272a]/50 hover:text-[#e4e4e7]"
											}`}
											key={session.id}
											onClick={() => setSelectedSessionId(session.id)}
											type="button"
										>
											<div className="flex items-start justify-between gap-2">
												<span className="truncate font-medium text-sm">
													{session.title || `Session ${session.id.slice(0, 8)}`}
												</span>
											</div>
											{session.createdAt && (
												<span className="mt-1 block text-[#52525b] text-xs">
													{formatTimestamp(session.createdAt)}
												</span>
											)}
										</button>
									))}
								</div>
							)}
						</div>
					</div>
				</aside>

				{/* Main Chat Area */}
				<main className="flex flex-1 flex-col">
					{error && (
						<div className="border-red-500/20 border-b bg-red-500/10 px-6 py-3">
							<p className="text-red-400 text-sm">{error}</p>
						</div>
					)}

					{!selectedSessionId ? (
						<div className="flex flex-1 flex-col items-center justify-center">
							<div className="mb-4 rounded-full bg-[#27272a] p-4">
								<svg
									aria-hidden="true"
									className="h-8 w-8 text-[#52525b]"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
									/>
								</svg>
							</div>
							<h2 className="mb-2 font-medium text-[#a1a1aa] text-lg">
								Select a session
							</h2>
							<p className="text-[#52525b] text-sm">
								Choose an existing session or create a new one
							</p>
						</div>
					) : (
						<>
							{/* Messages Area */}
							<div className="flex-1 overflow-y-auto p-6">
								{messages.length === 0 ? (
									<div className="flex h-full flex-col items-center justify-center">
										<div className="mb-4 rounded-full bg-[#27272a] p-4">
											<svg
												aria-hidden="true"
												className="h-8 w-8 text-[#52525b]"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
												/>
											</svg>
										</div>
										<p className="text-[#71717a] text-sm">No messages yet</p>
										<p className="text-[#52525b] text-xs">
											Send a message to start the conversation
										</p>
									</div>
								) : (
									<div className="space-y-4">
										{messages.map((message) => (
											<div
												className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
												key={message.id}
											>
												<div
													className={`max-w-[80%] rounded-2xl px-4 py-3 ${
														message.role === "user"
															? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
															: message.role === "assistant"
																? "bg-[#1c1c22] text-[#e4e4e7]"
																: "bg-[#27272a] text-[#a1a1aa] italic"
													}`}
												>
													<p className="whitespace-pre-wrap text-sm leading-relaxed">
														{message.content}
													</p>
													{message.createdAt && (
														<span
															className={`mt-2 block text-xs ${message.role === "user" ? "text-white/60" : "text-[#52525b]"}`}
														>
															{formatTimestamp(message.createdAt)}
														</span>
													)}
												</div>
											</div>
										))}
									</div>
								)}
							</div>

							{/* Message Input */}
							<div className="border-[#27272a] border-t bg-[#0f0f14]/80 p-4">
								{/* Provider/Model Selection */}
								<div className="mb-3 flex gap-3">
									<select
										className="rounded-lg border border-[#27272a] bg-[#1c1c22] px-3 py-2 text-[#e4e4e7] text-sm outline-none focus:border-emerald-500/50"
										onChange={(e) => setSelectedProvider(e.target.value)}
										value={selectedProvider}
									>
										<option value="anthropic">Anthropic</option>
										<option value="openai">OpenAI</option>
										<option value="cerebras">Cerebras</option>
										{providers.map((p) => (
											<option key={p.id} value={p.id}>
												{p.name || p.id}
											</option>
										))}
									</select>
									<input
										className="flex-1 rounded-lg border border-[#27272a] bg-[#1c1c22] px-3 py-2 text-[#e4e4e7] text-sm outline-none focus:border-emerald-500/50"
										onChange={(e) => setSelectedModel(e.target.value)}
										placeholder="Model ID (e.g., claude-sonnet-4-20250514)"
										type="text"
										value={selectedModel}
									/>
								</div>
								<div className="flex gap-3">
									<textarea
										className="flex-1 resize-none rounded-xl border border-[#27272a] bg-[#1c1c22] px-4 py-3 text-[#e4e4e7] text-sm placeholder-[#52525b] outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
										onChange={(e) => setNewMessage(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && !e.shiftKey) {
												e.preventDefault();
												sendMessage();
											}
										}}
										placeholder="Type your message..."
										rows={1}
										value={newMessage}
									/>
									<button
										className="flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3 text-white transition-all hover:from-emerald-600 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
										disabled={!newMessage.trim() || isSending}
										onClick={sendMessage}
										type="button"
									>
										{isSending ? (
											<svg
												aria-hidden="true"
												className="h-5 w-5 animate-spin"
												fill="none"
												viewBox="0 0 24 24"
											>
												<circle
													className="opacity-25"
													cx="12"
													cy="12"
													r="10"
													stroke="currentColor"
													strokeWidth="4"
												/>
												<path
													className="opacity-75"
													d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
													fill="currentColor"
												/>
											</svg>
										) : (
											<svg
												aria-hidden="true"
												className="h-5 w-5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
												/>
											</svg>
										)}
									</button>
								</div>
							</div>
						</>
					)}
				</main>
			</div>
		</div>
	);
}
