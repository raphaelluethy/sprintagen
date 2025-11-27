"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ui/theme-toggle";

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

	const statusStyles = {
		completed: "bg-foreground/5 text-foreground/60",
		error: "bg-destructive/10 text-destructive",
		running: "bg-foreground/5 text-foreground/60",
		pending: "bg-foreground/5 text-foreground/40",
	};

	return (
		<div className="my-2 overflow-hidden rounded-md border border-border/60 bg-card/50">
			<button
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-secondary/50"
				onClick={() => setIsExpanded(!isExpanded)}
				type="button"
			>
				<svg
					aria-hidden="true"
					className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
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
				<span className="font-mono text-foreground">{tool.tool}</span>
				<span className="text-muted-foreground">→</span>
				<span className="flex-1 truncate text-muted-foreground">
					{title || JSON.stringify(tool.state.input).slice(0, 50)}
				</span>
				<span
					className={`rounded px-1.5 py-0.5 font-medium text-[10px] ${statusStyles[tool.state.status]}`}
				>
					{tool.state.status}
				</span>
			</button>
			{isExpanded && (
				<div className="space-y-2 border-border/60 border-t bg-background/50 p-3">
					<div>
						<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
							Input
						</span>
						<pre className="mt-1 overflow-x-auto rounded bg-secondary/50 p-2 text-foreground/80 text-xs">
							{JSON.stringify(tool.state.input, null, 2)}
						</pre>
					</div>
					{output && (
						<div>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
								{tool.state.status === "error" ? "Error" : "Output"}
							</span>
							<pre
								className={`mt-1 max-h-64 overflow-x-auto overflow-y-auto rounded bg-secondary/50 p-2 text-xs ${
									tool.state.status === "error"
										? "text-destructive"
										: "text-foreground/80"
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
				<strong className="text-foreground" key={key}>
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
				className={`max-w-[85%] rounded-lg px-4 py-3 ${
					isUser
						? "bg-foreground text-background"
						: "border border-border/60 bg-card/50 text-foreground"
				}`}
			>
				{/* Role & Model badge for assistant */}
				{isAssistantMessage(message.info) && (
					<div className="mb-2 flex flex-wrap items-center gap-2 border-border/40 border-b pb-2">
						<span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
							{message.info.mode || "assistant"}
						</span>
						<span className="text-border">•</span>
						<span className="font-mono text-[10px] text-muted-foreground">
							{message.info.providerID}/{message.info.modelID}
						</span>
						{message.info.tokens && (
							<>
								<span className="text-border">•</span>
								<span className="text-[10px] text-muted-foreground">
									{message.info.tokens.input + message.info.tokens.output} tok
								</span>
							</>
						)}
						{message.info.finish && (
							<Badge
								className="h-4 px-1 text-[10px]"
								variant={
									message.info.finish === "stop" ? "default" : "secondary"
								}
							>
								{message.info.finish}
							</Badge>
						)}
					</div>
				)}

				{/* User message agent/model info */}
				{isUserMessage(message.info) && (
					<div className="mb-2 flex items-center gap-2 border-background/20 border-b pb-2 text-background/70">
						<span className="text-[10px] uppercase tracking-wider">
							→ {message.info.agent}
						</span>
					</div>
				)}

				{/* Reasoning section (collapsible) */}
				{!isUser && reasoningContent && (
					<div className="mb-3">
						<button
							className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
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
							<div className="mt-2 rounded border border-border/40 bg-secondary/30 p-2 text-muted-foreground text-xs italic">
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
					<div className="mt-3 rounded border border-destructive/20 bg-destructive/10 p-2">
						<span className="font-medium text-destructive text-xs">
							{message.info.error.name}
						</span>
						{typeof message.info.error.data?.message === "string" && (
							<p className="mt-1 text-destructive/80 text-xs">
								{message.info.error.data.message}
							</p>
						)}
					</div>
				)}

				{/* Timestamp */}
				{message.info.time.created && (
					<span
						className={`mt-2 block text-xs ${isUser ? "text-background/60" : "text-muted-foreground"}`}
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
	const [selectedProvider, setSelectedProvider] = useState<string>("opencode");
	const [selectedModel, setSelectedModel] = useState<string>("big-pickle");
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
		<div className="flex h-screen flex-col bg-background">
			{/* Header */}
			<header className="flex h-14 shrink-0 items-center justify-between border-border/40 border-b px-6">
				<div className="flex items-center gap-4">
					<a
						className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
						href="/"
					>
						<svg
							aria-hidden="true"
							className="h-4 w-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M15 19l-7-7 7-7"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
							/>
						</svg>
						<span className="text-sm">Back</span>
					</a>
					<div className="h-4 w-px bg-border" />
					<h1 className="font-medium text-sm">Opencode Chat</h1>
				</div>
				<div className="flex items-center gap-4">
					{authStatus && (
						<span className="text-muted-foreground text-xs">{authStatus}</span>
					)}
					<div className="flex items-center gap-2">
						<div
							className={`h-2 w-2 rounded-full ${
								healthStatus === "healthy"
									? "bg-foreground"
									: healthStatus === "unhealthy"
										? "bg-destructive"
										: "animate-pulse bg-muted-foreground"
							}`}
						/>
						<span className="text-muted-foreground text-xs">
							{healthStatus === "checking"
								? "Connecting..."
								: healthStatus === "healthy"
									? "Connected"
									: "Disconnected"}
						</span>
					</div>
					<ThemeToggle />
				</div>
			</header>

			{/* Main Content */}
			<div className="flex min-h-0 flex-1">
				{/* Sidebar - Sessions List */}
				<aside className="flex w-72 shrink-0 flex-col border-border/40 border-r bg-card/30">
					<div className="border-border/40 border-b p-4">
						<Button
							className="w-full"
							disabled={isLoading || healthStatus !== "healthy"}
							onClick={createSession}
							size="sm"
						>
							New Session
						</Button>
					</div>

					<ScrollArea className="flex-1">
						<div className="p-2">
							{sessions.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-12 text-center">
									<p className="text-muted-foreground text-sm">
										No sessions yet
									</p>
									<p className="text-muted-foreground/60 text-xs">
										Create one to get started
									</p>
								</div>
							) : (
								<div className="space-y-1">
									{sessions.map((session) => (
										<button
											className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
												selectedSessionId === session.id
													? "bg-secondary text-foreground"
													: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
											}`}
											key={session.id}
											onClick={() => setSelectedSessionId(session.id)}
											type="button"
										>
											<span className="block truncate text-sm">
												{session.title || `Session ${session.id.slice(0, 8)}`}
											</span>
											{session.createdAt && (
												<span className="mt-0.5 block text-[11px] opacity-60">
													{formatTimestamp(session.createdAt)}
												</span>
											)}
										</button>
									))}
								</div>
							)}
						</div>
					</ScrollArea>
				</aside>

				{/* Main Chat Area */}
				<main className="flex min-w-0 flex-1 flex-col">
					{error && (
						<div className="border-destructive/20 border-b bg-destructive/10 px-6 py-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}

					{!selectedSessionId ? (
						<div className="flex flex-1 flex-col items-center justify-center">
							<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border/60">
								<svg
									aria-hidden="true"
									className="h-6 w-6 text-muted-foreground"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
									/>
								</svg>
							</div>
							<h2 className="mb-1 font-medium text-foreground">
								Select a session
							</h2>
							<p className="text-muted-foreground text-sm">
								Choose an existing session or create a new one
							</p>
						</div>
					) : (
						<>
							{/* Messages Area */}
							<ScrollArea className="flex-1">
								<div className="mx-auto max-w-3xl p-6">
									{messages.length === 0 ? (
										<div className="flex h-full flex-col items-center justify-center py-20">
											<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border/60">
												<svg
													aria-hidden="true"
													className="h-6 w-6 text-muted-foreground"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={1.5}
													/>
												</svg>
											</div>
											<p className="text-muted-foreground text-sm">
												No messages yet
											</p>
											<p className="text-muted-foreground/60 text-xs">
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
							</ScrollArea>

							{/* Message Input */}
							<div className="border-border/40 border-t bg-card/30 p-4">
								<div className="mx-auto max-w-3xl">
									{/* Agent/Provider/Model Selection */}
									<div className="mb-3 flex flex-wrap gap-2">
										<Select
											disabled={agents.length === 0}
											onValueChange={setSelectedAgent}
											value={agents.length === 0 ? "" : selectedAgent}
										>
											<SelectTrigger className="h-8 w-[160px] text-xs">
												<SelectValue placeholder="Select agent" />
											</SelectTrigger>
											<SelectContent>
												{agents.map((agent) => (
													<SelectItem key={agent.name} value={agent.name}>
														{agent.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Select
											onValueChange={setSelectedProvider}
											value={selectedProvider}
										>
											<SelectTrigger className="h-8 w-[130px] text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="anthropic">Anthropic</SelectItem>
												<SelectItem value="openai">OpenAI</SelectItem>
												<SelectItem value="cerebras">Cerebras</SelectItem>
												{providers.map((p) => (
													<SelectItem key={p.id} value={p.id}>
														{p.name || p.id}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Input
											className="h-8 flex-1 text-xs"
											onChange={(e) => setSelectedModel(e.target.value)}
											placeholder="Model ID"
											value={selectedModel}
										/>
									</div>
									<div className="flex gap-3">
										<Textarea
											className="min-h-[44px] flex-1 resize-none text-sm"
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
										<Button
											className="h-auto px-4"
											disabled={
												!newMessage.trim() || isSending || !selectedAgent
											}
											onClick={sendMessage}
										>
											{isSending ? (
												<svg
													aria-hidden="true"
													className="h-4 w-4 animate-spin"
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
													className="h-4 w-4"
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
										</Button>
									</div>
								</div>
							</div>
						</>
					)}
				</main>
			</div>
		</div>
	);
}
