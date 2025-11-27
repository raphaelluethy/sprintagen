"use client";

import { useCallback, useEffect, useState } from "react";

interface Session {
	id: string;
	title?: string;
	createdAt?: string;
}

// Opencode API response types - based on SDK types.gen.ts

interface UserMessageInfo {
	id: string;
	sessionID: string;
	role: "user";
	time: {
		created: number;
	};
	summary?: {
		title?: string;
		body?: string;
		diffs: Array<{
			file: string;
			before: string;
			after: string;
			additions: number;
			deletions: number;
		}>;
	};
	agent: string;
	model: {
		providerID: string;
		modelID: string;
	};
	system?: string;
	tools?: Record<string, boolean>;
}

interface AssistantMessageInfo {
	id: string;
	sessionID: string;
	role: "assistant";
	time: {
		created: number;
		completed?: number;
	};
	error?: {
		name: string;
		data: Record<string, unknown>;
	};
	parentID: string;
	modelID: string;
	providerID: string;
	mode: string;
	path: {
		cwd: string;
		root: string;
	};
	summary?: boolean;
	cost: number;
	tokens: {
		input: number;
		output: number;
		reasoning: number;
		cache: {
			read: number;
			write: number;
		};
	};
	finish?: string;
}

type MessageInfo = UserMessageInfo | AssistantMessageInfo;

interface TextPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "text";
	text: string;
	synthetic?: boolean;
	ignored?: boolean;
	time?: {
		start: number;
		end?: number;
	};
	metadata?: Record<string, unknown>;
}

interface ReasoningPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "reasoning";
	text: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
		end?: number;
	};
}

interface ToolStatePending {
	status: "pending";
	input: Record<string, unknown>;
	raw: string;
}

interface ToolStateRunning {
	status: "running";
	input: Record<string, unknown>;
	title?: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
	};
}

interface ToolStateCompleted {
	status: "completed";
	input: Record<string, unknown>;
	output: string;
	title: string;
	metadata: Record<string, unknown>;
	time: {
		start: number;
		end: number;
		compacted?: number;
	};
}

interface ToolStateError {
	status: "error";
	input: Record<string, unknown>;
	error: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
		end: number;
	};
}

type ToolState =
	| ToolStatePending
	| ToolStateRunning
	| ToolStateCompleted
	| ToolStateError;

interface ToolPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "tool";
	callID: string;
	tool: string;
	state: ToolState;
	metadata?: Record<string, unknown>;
}

interface StepStartPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "step-start";
	snapshot?: string;
}

interface StepFinishPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "step-finish";
	reason: string;
	snapshot?: string;
	cost: number;
	tokens: {
		input: number;
		output: number;
		reasoning: number;
		cache: {
			read: number;
			write: number;
		};
	};
}

interface FilePart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "file";
	mime: string;
	filename?: string;
	url: string;
}

type MessagePart =
	| TextPart
	| ReasoningPart
	| ToolPart
	| StepStartPart
	| StepFinishPart
	| FilePart;

interface OpencodeMessage {
	info: MessageInfo;
	parts: MessagePart[];
}

interface Provider {
	id: string;
	name: string;
	models?: { id: string; name: string }[];
}

interface Agent {
	name: string;
	description?: string;
	mode?: string;
	builtIn?: boolean;
}

// Debug logger with styled output
const DEBUG = process.env.NODE_ENV === "development";
const log = {
	info: (label: string, ...args: unknown[]) => {
		if (DEBUG)
			console.log(
				`%c[Chat] %c${label}`,
				"color: #10b981; font-weight: bold",
				"color: #a1a1aa",
				...args,
			);
	},
	success: (label: string, ...args: unknown[]) => {
		if (DEBUG)
			console.log(
				`%c[Chat] %c✓ ${label}`,
				"color: #10b981; font-weight: bold",
				"color: #22c55e",
				...args,
			);
	},
	warn: (label: string, ...args: unknown[]) => {
		if (DEBUG)
			console.warn(
				`%c[Chat] %c⚠ ${label}`,
				"color: #10b981; font-weight: bold",
				"color: #eab308",
				...args,
			);
	},
	error: (label: string, ...args: unknown[]) => {
		if (DEBUG)
			console.error(
				`%c[Chat] %c✗ ${label}`,
				"color: #10b981; font-weight: bold",
				"color: #ef4444",
				...args,
			);
	},
	debug: (label: string, data: unknown) => {
		if (DEBUG) {
			console.groupCollapsed(
				`%c[Chat] %c${label}`,
				"color: #10b981; font-weight: bold",
				"color: #6366f1",
			);
			console.log(data);
			console.groupEnd();
		}
	},
};

// Helper to extract text content from message parts
function getTextContent(parts: MessagePart[]): string {
	return parts
		.filter((p): p is TextPart => p.type === "text")
		.map((p) => p.text)
		.join("")
		.trim();
}

// Helper to get reasoning content from message parts
function getReasoningContent(parts: MessagePart[]): string {
	return parts
		.filter((p): p is ReasoningPart => p.type === "reasoning")
		.map((p) => p.text)
		.join("")
		.trim();
}

// Helper to get tool calls from message parts
function getToolCalls(parts: MessagePart[]): ToolPart[] {
	return parts.filter((p): p is ToolPart => p.type === "tool");
}

// Helper to get tool title based on state
function getToolTitle(state: ToolState): string | undefined {
	if (state.status === "completed" || state.status === "running") {
		return state.title;
	}
	return undefined;
}

// Helper to get tool output
function getToolOutput(state: ToolState): string | undefined {
	if (state.status === "completed") {
		return state.output;
	}
	if (state.status === "error") {
		return state.error;
	}
	return undefined;
}

// Helper to get tool preview
function getToolPreview(state: ToolState): string | undefined {
	if (state.status === "completed" && state.metadata?.preview) {
		return state.metadata.preview as string;
	}
	return undefined;
}

// Tool call component
function ToolCallDisplay({ tool }: { tool: ToolPart }) {
	const [isExpanded, setIsExpanded] = useState(false);
	const title = getToolTitle(tool.state);
	const output = getToolOutput(tool.state);
	const preview = getToolPreview(tool.state);

	return (
		<div className="my-2 overflow-hidden rounded-lg border border-[#27272a] bg-[#18181b]">
			<button
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-[#27272a]/50"
				onClick={() => setIsExpanded(!isExpanded)}
				type="button"
			>
				<svg
					aria-hidden="true"
					className={`h-3 w-3 text-[#71717a] transition-transform ${isExpanded ? "rotate-90" : ""}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						d="M9 5l7 7-7 7"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
					/>
				</svg>
				<span className="font-mono text-amber-400">{tool.tool}</span>
				<span className="text-[#52525b]">→</span>
				<span className="flex-1 truncate text-[#a1a1aa]">
					{title || JSON.stringify(tool.state.input).slice(0, 50)}
				</span>
				<span
					className={`rounded px-1.5 py-0.5 font-medium text-[10px] ${
						tool.state.status === "completed"
							? "bg-emerald-500/20 text-emerald-400"
							: tool.state.status === "error"
								? "bg-red-500/20 text-red-400"
								: tool.state.status === "running"
									? "bg-blue-500/20 text-blue-400"
									: "bg-yellow-500/20 text-yellow-400"
					}`}
				>
					{tool.state.status}
				</span>
			</button>
			{isExpanded && (
				<div className="space-y-2 border-[#27272a] border-t p-3">
					<div>
						<span className="text-[#52525b] text-[10px] uppercase tracking-wider">
							Input
						</span>
						<pre className="mt-1 overflow-x-auto rounded bg-[#0f0f14] p-2 text-[#a1a1aa] text-xs">
							{JSON.stringify(tool.state.input, null, 2)}
						</pre>
					</div>
					{output && (
						<div>
							<span className="text-[#52525b] text-[10px] uppercase tracking-wider">
								{tool.state.status === "error" ? "Error" : "Output"}
							</span>
							<pre
								className={`mt-1 max-h-64 overflow-x-auto overflow-y-auto rounded bg-[#0f0f14] p-2 text-xs ${
									tool.state.status === "error"
										? "text-red-400"
										: "text-[#a1a1aa]"
								}`}
							>
								{preview || output.slice(0, 1000)}
								{output.length > 1000 && !preview && "..."}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// Helper to check if message is from user
function isUserMessage(info: MessageInfo): info is UserMessageInfo {
	return info.role === "user";
}

// Helper to check if message is from assistant
function isAssistantMessage(info: MessageInfo): info is AssistantMessageInfo {
	return info.role === "assistant";
}

// Simple markdown-like rendering
function renderMarkdown(text: string): React.ReactNode {
	// Split by markdown patterns
	const parts = text.split(/(\*\*[^*]+\*\*|\n- |\n\*\*[^*]+:\*\*)/g);

	return parts.map((part, i) => {
		// Use the content itself as part of the key for uniqueness
		const key = `${i}-${part.slice(0, 10)}`;
		if (part.startsWith("**") && part.endsWith("**")) {
			return (
				<strong className="text-[#e4e4e7]" key={key}>
					{part.slice(2, -2)}
				</strong>
			);
		}
		if (part === "\n- ") {
			return <span key={key}>{"\n• "}</span>;
		}
		return <span key={key}>{part}</span>;
	});
}

// Message component
function MessageDisplay({ message }: { message: OpencodeMessage }) {
	const textContent = getTextContent(message.parts);
	const reasoningContent = getReasoningContent(message.parts);
	const toolCalls = getToolCalls(message.parts);
	const isUser = isUserMessage(message.info);
	const [showReasoning, setShowReasoning] = useState(false);

	return (
		<div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
			<div
				className={`max-w-[85%] rounded-2xl px-4 py-3 ${
					isUser
						? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
						: "bg-[#1c1c22] text-[#e4e4e7]"
				}`}
			>
				{/* Role & Model badge for assistant */}
				{isAssistantMessage(message.info) && (
					<div className="mb-2 flex flex-wrap items-center gap-2 border-[#27272a] border-b pb-2">
						<span className="font-medium text-[10px] text-emerald-400 uppercase tracking-wider">
							{message.info.mode || "assistant"}
						</span>
						<span className="text-[#27272a]">•</span>
						<span className="font-mono text-[#52525b] text-[10px]">
							{message.info.providerID}/{message.info.modelID}
						</span>
						{message.info.tokens && (
							<>
								<span className="text-[#27272a]">•</span>
								<span className="text-[#52525b] text-[10px]">
									{message.info.tokens.input + message.info.tokens.output}{" "}
									tokens
								</span>
							</>
						)}
						{message.info.finish && (
							<span
								className={`rounded px-1.5 py-0.5 font-medium text-[10px] ${
									message.info.finish === "stop"
										? "bg-emerald-500/20 text-emerald-400"
										: message.info.finish === "tool-calls"
											? "bg-amber-500/20 text-amber-400"
											: "bg-[#27272a] text-[#71717a]"
								}`}
							>
								{message.info.finish}
							</span>
						)}
					</div>
				)}

				{/* User message agent/model info */}
				{isUserMessage(message.info) && (
					<div className="mb-2 flex items-center gap-2 border-white/20 border-b pb-2 text-white/70">
						<span className="text-[10px] uppercase tracking-wider">
							→ {message.info.agent}
						</span>
					</div>
				)}

				{/* Reasoning section (collapsible) */}
				{!isUser && reasoningContent && (
					<div className="mb-3">
						<button
							className="flex items-center gap-1 text-[10px] text-purple-400 transition-colors hover:text-purple-300"
							onClick={() => setShowReasoning(!showReasoning)}
							type="button"
						>
							<svg
								aria-hidden="true"
								className={`h-3 w-3 transition-transform ${showReasoning ? "rotate-90" : ""}`}
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M9 5l7 7-7 7"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
								/>
							</svg>
							Reasoning
						</button>
						{showReasoning && (
							<div className="mt-2 rounded border border-purple-500/20 bg-purple-500/10 p-2 text-purple-200 text-xs italic">
								{reasoningContent}
							</div>
						)}
					</div>
				)}

				{/* Tool calls (for assistant messages) */}
				{!isUser && toolCalls.length > 0 && (
					<div className="mb-3">
						{toolCalls.map((tool) => (
							<ToolCallDisplay key={tool.id} tool={tool} />
						))}
					</div>
				)}

				{/* Text content */}
				{textContent && (
					<div className="whitespace-pre-wrap text-sm leading-relaxed">
						{renderMarkdown(textContent)}
					</div>
				)}

				{/* Error display */}
				{isAssistantMessage(message.info) && message.info.error && (
					<div className="mt-3 rounded border border-red-500/20 bg-red-500/10 p-2">
						<span className="font-medium text-red-400 text-xs">
							{message.info.error.name}
						</span>
						{message.info.error.data?.message && (
							<p className="mt-1 text-red-300 text-xs">
								{String(message.info.error.data.message)}
							</p>
						)}
					</div>
				)}

				{/* Timestamp */}
				{message.info.time.created && (
					<span
						className={`mt-2 block text-xs ${isUser ? "text-white/60" : "text-[#52525b]"}`}
					>
						{new Date(message.info.time.created).toLocaleString()}
					</span>
				)}
			</div>
		</div>
	);
}

export default function AdminChatsPage() {
	const [sessions, setSessions] = useState<Session[]>([]);
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
		null,
	);
	const [messages, setMessages] = useState<OpencodeMessage[]>([]);
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
	const [agents, setAgents] = useState<Agent[]>([]);
	const [selectedAgent, setSelectedAgent] = useState<string>("docs-agent");

	// Check health and configure auth on mount
	useEffect(() => {
		async function initialize() {
			log.info("Initializing...");

			// Check health
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

					// Auto-configure auth from env vars
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
							setSelectedProvider(authData.providerId);
						} else if (authData.error) {
							log.warn(`Auth error: ${authData.error}`);
							setAuthStatus(`Auth error: ${authData.error}`);
						} else {
							log.info("No auth configured");
						}
					} else {
						log.warn(`Auth fetch failed: ${authRes.status}`);
					}

					// Fetch providers
					log.info("Fetching providers...");
					const providersRes = await fetch("/api/opencode/providers");
					if (providersRes.ok) {
						const providersData = await providersRes.json();
						log.debug("Providers response", providersData);
						if (Array.isArray(providersData)) {
							log.success(`Loaded ${providersData.length} providers`);
							setProviders(providersData);
						}
					} else {
						log.warn(`Providers fetch failed: ${providersRes.status}`);
					}

					// Fetch agents
					log.info("Fetching agents...");
					const agentsRes = await fetch("/api/opencode/agents");
					if (agentsRes.ok) {
						const agentsData = await agentsRes.json();
						log.debug("Agents response", agentsData);
						if (Array.isArray(agentsData)) {
							log.success(`Loaded ${agentsData.length} agents`);
							setAgents(agentsData);
							// Ensure docs-agent is selected if it exists, otherwise use first agent
							const docsAgent = agentsData.find(
								(a: Agent) => a.name === "docs-agent",
							);
							if (docsAgent) {
								setSelectedAgent("docs-agent");
							} else if (agentsData.length > 0) {
								setSelectedAgent(agentsData[0].name);
							}
						}
					} else {
						log.warn(`Agents fetch failed: ${agentsRes.status}`);
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
			// Handle Opencode API response format
			const messageList: OpencodeMessage[] = Array.isArray(data)
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
	const createSession = async () => {
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
	};

	// Send message
	const sendMessage = async () => {
		if (!selectedSessionId || !newMessage.trim() || !selectedAgent) return;

		const messageText = newMessage.trim();
		log.info(`Sending message to session ${selectedSessionId.slice(0, 8)}...`);

		// Construct PromptInput payload according to Opencode API spec
		const payload = {
			agent: selectedAgent,
			model: {
				providerID: selectedProvider,
				modelID: selectedModel,
			},
			parts: [
				{
					type: "text",
					text: messageText,
				},
			],
		};

		log.debug("Message payload", {
			agent: payload.agent,
			model: payload.model,
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
										{messages.map((message, index) => (
											<MessageDisplay
												key={message.info.id || `msg-${index}`}
												message={message}
											/>
										))}
									</div>
								)}
							</div>

							{/* Message Input */}
							<div className="border-[#27272a] border-t bg-[#0f0f14]/80 p-4">
								{/* Agent/Provider/Model Selection */}
								<div className="mb-3 flex gap-3">
									<select
										className="rounded-lg border border-[#27272a] bg-[#1c1c22] px-3 py-2 text-[#e4e4e7] text-sm outline-none focus:border-emerald-500/50"
										disabled={agents.length === 0}
										onChange={(e) => setSelectedAgent(e.target.value)}
										value={agents.length === 0 ? "" : selectedAgent}
									>
										{agents.length === 0 ? (
											<option value="">Loading agents...</option>
										) : (
											agents.map((agent) => (
												<option key={agent.name} value={agent.name}>
													{agent.name}
													{agent.description ? ` - ${agent.description}` : ""}
												</option>
											))
										)}
									</select>
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
										disabled={!newMessage.trim() || isSending || !selectedAgent}
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
