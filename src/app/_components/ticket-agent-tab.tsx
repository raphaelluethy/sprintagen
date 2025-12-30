"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useOpencodeSSE } from "@/hooks/useOpencodeSSE";
import type { ReasoningPart, ToolPart } from "@/server/tickets/opencode";
import { api } from "@/trpc/react";
import {
	OpencodeReasoningDisplay,
	OpencodeStepsCollapsible,
} from "./opencode-tool-call";
import type { OpencodeChatMessage } from "./types";

// Types for grouped messages
type MessageGroup =
	| { type: "user"; message: OpencodeChatMessage }
	| { type: "response"; message: OpencodeChatMessage }
	| {
			type: "tool-steps";
			messages: OpencodeChatMessage[];
			toolParts: ToolPart[];
	  };

// Group messages: consecutive tool-only agent messages get combined
function groupMessages(messages: OpencodeChatMessage[]): MessageGroup[] {
	const groups: MessageGroup[] = [];
	let currentToolGroup: OpencodeChatMessage[] = [];
	let currentToolParts: ToolPart[] = [];

	const flushToolGroup = () => {
		if (currentToolGroup.length > 0) {
			groups.push({
				type: "tool-steps",
				messages: [...currentToolGroup],
				toolParts: [...currentToolParts],
			});
			currentToolGroup = [];
			currentToolParts = [];
		}
	};

	for (const msg of messages) {
		if (msg.role === "user") {
			flushToolGroup();
			groups.push({ type: "user", message: msg });
		} else {
			// Agent message - check if it has text content
			const toolParts =
				msg.parts?.filter((p): p is ToolPart => p.type === "tool") ?? [];
			const hasText = !!msg.text?.trim();

			if (hasText) {
				// This is a response message - flush any pending tool group first
				flushToolGroup();
				groups.push({ type: "response", message: msg });
			} else if (toolParts.length > 0) {
				// Tool-only message - add to current group
				currentToolGroup.push(msg);
				currentToolParts.push(...toolParts);
			}
			// Skip empty messages (no text, no tools)
		}
	}

	// Flush any remaining tool group
	flushToolGroup();

	return groups;
}

// Grouped tool steps block with distinctive amber styling
function ToolStepsBlock({
	toolParts,
	timestamp,
	model,
}: {
	toolParts: ToolPart[];
	timestamp: Date;
	model?: string;
}) {
	const [isExpanded, setIsExpanded] = useState(false);

	const completedCount = toolParts.filter(
		(t) => t.state.status === "completed",
	).length;
	const runningCount = toolParts.filter(
		(t) => t.state.status === "running",
	).length;
	const errorCount = toolParts.filter((t) => t.state.status === "error").length;

	return (
		<div className="relative pl-8">
			{/* Timeline dot - amber for tool steps */}
			<div className="absolute top-2 left-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-amber-500 ring-4 ring-background" />

			{/* Header */}
			<div className="mb-2 flex items-center gap-2">
				<time className="font-medium text-muted-foreground text-xs">
					{timestamp.toLocaleString(undefined, {
						dateStyle: "medium",
						timeStyle: "short",
					})}
				</time>
				<span className="font-medium text-amber-600 text-xs uppercase tracking-wider dark:text-amber-400">
					Working
				</span>
				{model && (
					<Badge
						className="h-5 px-1.5 font-normal text-[10px]"
						variant="outline"
					>
						{model}
					</Badge>
				)}
			</div>

			{/* Tool steps card - amber tinted */}
			<div className="overflow-hidden rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-amber-600/10">
				<button
					className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-amber-500/5"
					onClick={() => setIsExpanded(!isExpanded)}
					type="button"
				>
					{/* Expand/collapse indicator */}
					<svg
						aria-hidden="true"
						className={`h-3.5 w-3.5 text-amber-600 transition-transform dark:text-amber-400 ${isExpanded ? "rotate-90" : ""}`}
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

					{/* Tool icon */}
					<div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/15">
						<svg
							aria-hidden="true"
							className="h-4 w-4 text-amber-600 dark:text-amber-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
							/>
						</svg>
					</div>

					{/* Summary text */}
					<div className="flex-1">
						<span className="font-medium text-foreground text-sm">
							{toolParts.length} step{toolParts.length !== 1 ? "s" : ""}
						</span>
						<span className="ml-2 text-muted-foreground text-xs">
							{runningCount > 0 && (
								<span className="text-amber-600 dark:text-amber-400">
									{runningCount} running
								</span>
							)}
							{runningCount > 0 &&
								(completedCount > 0 || errorCount > 0) &&
								" · "}
							{completedCount > 0 && <span>{completedCount} completed</span>}
							{completedCount > 0 && errorCount > 0 && " · "}
							{errorCount > 0 && (
								<span className="text-destructive">{errorCount} failed</span>
							)}
						</span>
					</div>

					{/* Status indicator */}
					{runningCount > 0 ? (
						<div className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-1">
							<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
							<span className="font-medium text-[10px] text-amber-600 dark:text-amber-400">
								Running
							</span>
						</div>
					) : errorCount > 0 ? (
						<div className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-1">
							<span className="text-destructive text-xs">!</span>
							<span className="font-medium text-[10px] text-destructive">
								Error
							</span>
						</div>
					) : (
						<div className="flex items-center gap-1.5 rounded-full bg-foreground/5 px-2 py-1">
							<span className="text-muted-foreground text-xs">✓</span>
							<span className="font-medium text-[10px] text-muted-foreground">
								Done
							</span>
						</div>
					)}
				</button>

				{/* Expanded tool list */}
				{isExpanded && (
					<div className="border-amber-500/10 border-t bg-background/50 p-2">
						<div className="space-y-1">
							{toolParts.map((tool) => (
								<ToolStepItem key={tool.id} tool={tool} />
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// Individual tool step item within the grouped block
function ToolStepItem({ tool }: { tool: ToolPart }) {
	const [isExpanded, setIsExpanded] = useState(false);

	const statusStyles = {
		completed: "text-muted-foreground",
		error: "text-destructive",
		running: "text-amber-600 dark:text-amber-400",
		pending: "text-muted-foreground/50",
	};

	const statusIcons = {
		completed: "✓",
		error: "✗",
		running: "◎",
		pending: "○",
	};

	const getToolSummary = () => {
		const input = tool.state.input;
		switch (tool.tool) {
			case "read":
				return input.filePath as string;
			case "edit":
			case "write":
				return input.filePath as string;
			case "bash":
				return (input.command as string).slice(0, 60);
			case "grep":
			case "glob":
				return input.pattern as string;
			case "webfetch":
				return input.url as string;
			case "task":
				return (
					(input.description as string) ||
					(input.prompt as string) ||
					""
				).slice(0, 60);
			default:
				return JSON.stringify(input).slice(0, 60);
		}
	};

	const output =
		tool.state.status === "completed"
			? tool.state.output
			: tool.state.status === "error"
				? tool.state.error
				: undefined;

	return (
		<div className="overflow-hidden rounded border border-border/40 bg-card/30">
			<button
				className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-secondary/30"
				onClick={() => setIsExpanded(!isExpanded)}
				type="button"
			>
				<span
					className={`w-4 text-center ${statusStyles[tool.state.status]} ${tool.state.status === "running" ? "animate-pulse" : ""}`}
				>
					{statusIcons[tool.state.status]}
				</span>
				<span className="font-mono text-amber-700 dark:text-amber-300">
					{tool.tool}
				</span>
				<span className="text-muted-foreground/50">→</span>
				<span className="flex-1 truncate text-muted-foreground">
					{getToolSummary()}
				</span>
				<svg
					aria-hidden="true"
					className={`h-3 w-3 text-muted-foreground/50 transition-transform ${isExpanded ? "rotate-90" : ""}`}
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
			</button>

			{isExpanded && output && (
				<div className="border-border/40 border-t bg-secondary/20 p-2">
					<pre
						className={`max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] ${
							tool.state.status === "error"
								? "text-destructive"
								: "text-muted-foreground"
						}`}
					>
						{output.slice(0, 1500)}
						{output.length > 1500 && "\n... (truncated)"}
					</pre>
				</div>
			)}
		</div>
	);
}

interface TicketAgentTabProps {
	ticketId: string;
	opencodeAvailable: boolean;
	opencodeChatSessionId: string | null;
	activeTab: string;
	open: boolean;
	replyingToInsight: { insight: string; date: Date } | null;
	onReplyingToInsightChange: (
		insight: { insight: string; date: Date } | null,
	) => void;
	onSessionIdChange: (sessionId: string | null) => void;
}

export function TicketAgentTab({
	ticketId,
	opencodeAvailable,
	opencodeChatSessionId,
	activeTab,
	open,
	replyingToInsight,
	onReplyingToInsightChange,
	onSessionIdChange,
}: TicketAgentTabProps) {
	const [opencodeChatInput, setOpencodeChatInput] = useState("");
	const [optimisticOpencodeMessages, setOptimisticOpencodeMessages] = useState<
		OpencodeChatMessage[]
	>([]);
	const [sessionRequested, setSessionRequested] = useState(false);
	const opencodeChatEndRef = useRef<HTMLDivElement>(null);

	const opencodeStatusQuery = api.ticket.getOpencodeStatus.useQuery(undefined, {
		enabled: open,
		staleTime: 30000,
	});

	const startSessionMutation = api.ticket.startOpencodeSession.useMutation({
		onSuccess: (data) => {
			onSessionIdChange(data.sessionId);
		},
	});

	// Start a new session when Agent chat tab is first accessed
	useEffect(() => {
		if (
			activeTab === "agent-chat" &&
			ticketId &&
			open &&
			!sessionRequested &&
			opencodeStatusQuery.data?.available
		) {
			setSessionRequested(true);
			startSessionMutation.mutate({ ticketId });
		}
	}, [
		activeTab,
		ticketId,
		open,
		sessionRequested,
		opencodeStatusQuery.data?.available,
		startSessionMutation,
	]);

	// SSE connection for real-time updates
	const sseConnection = useOpencodeSSE(
		opencodeChatSessionId,
		open && activeTab === "agent-chat" && !!opencodeChatSessionId,
	);

	// Initial data fetch (no polling)
	const opencodeChatQuery = api.ticket.getOpencodeChat.useQuery(
		{
			ticketId,
			sessionId: opencodeChatSessionId ?? undefined,
		},
		{
			enabled:
				!!ticketId &&
				open &&
				activeTab === "agent-chat" &&
				!!opencodeChatSessionId,
		},
	);

	// Merge initial query data with SSE updates
	const opencodeData = opencodeChatQuery.data;

	// Transform SSE messages to the expected format
	const sseMessages = useMemo((): OpencodeChatMessage[] => {
		return sseConnection.messages.map((m) => {
			const textParts = m.parts
				.filter(
					(p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
				)
				.map((p) => p.text);

			const reasoningParts = m.parts.filter(
				(p): p is ReasoningPart => p.type === "reasoning",
			);

			const time = m.info.time as { created?: number };

			return {
				id: m.info.id,
				role: m.info.role,
				text: textParts.join("\n"),
				createdAt: new Date(time.created ?? Date.now()),
				model:
					"providerID" in m.info && "modelID" in m.info
						? `${m.info.providerID}/${m.info.modelID}`
						: undefined,
				parts: m.parts,
				reasoning: reasoningParts.map((p) => p.text).join("\n") || undefined,
				sessionId: m.info.sessionID,
			};
		});
	}, [sseConnection.messages]);

	// Use SSE messages if available, otherwise fall back to query data
	const opencodeMessages = useMemo(() => {
		const baseMessages =
			sseMessages.length > 0 ? sseMessages : (opencodeData?.messages ?? []);
		return [...baseMessages, ...optimisticOpencodeMessages];
	}, [sseMessages, opencodeData?.messages, optimisticOpencodeMessages]);

	const sendOpencodeMutation = api.ticket.sendOpencodeChatMessage.useMutation({
		onMutate: (variables) => {
			const optimisticMessage: OpencodeChatMessage = {
				id: `optimistic-${Date.now()}`,
				role: "user",
				text: variables.message,
				createdAt: new Date(),
			};
			setOptimisticOpencodeMessages((prev) => [...prev, optimisticMessage]);
			setOpencodeChatInput("");
		},
		onSuccess: () => {
			setOptimisticOpencodeMessages([]);
			void opencodeChatQuery.refetch();
		},
		onError: () => {
			setOptimisticOpencodeMessages([]);
		},
	});

	// Scroll to bottom when opencode messages change
	useEffect(() => {
		if (opencodeMessages.length > 0) {
			opencodeChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [opencodeMessages.length]);

	const handleSendOpencodeMessage = () => {
		if (!opencodeChatInput.trim() || !ticketId || !opencodeChatSessionId)
			return;

		let messageToSend = opencodeChatInput.trim();
		if (replyingToInsight) {
			messageToSend = `Context (Insight from ${replyingToInsight.date.toLocaleString()}):\n> ${replyingToInsight.insight.replace(/\n/g, "\n> ")}\n\n${messageToSend}`;
			onReplyingToInsightChange(null);
		}

		sendOpencodeMutation.mutate({
			ticketId,
			message: messageToSend,
			sessionId: opencodeChatSessionId,
		});
	};

	if (!opencodeAvailable) {
		return (
			<TabsContent
				className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
				value="agent-chat"
			>
				<div className="flex min-h-0 flex-1 flex-col pt-0 pr-6 pb-2 pl-6">
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<p className="text-muted-foreground text-sm">
							Agent is not available
						</p>
						<p className="text-muted-foreground/60 text-xs">
							Make sure the Agent server is running and configured
						</p>
					</div>
				</div>
			</TabsContent>
		);
	}

	return (
		<TabsContent
			className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
			value="agent-chat"
		>
			<div className="flex min-h-0 flex-1 flex-col pt-0 pr-6 pb-2 pl-6">
				{/* Connection status indicator */}
				{sseConnection.connectionState === "error" && (
					<div className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
						Connection lost. Retrying...
					</div>
				)}

				{/* Opencode chat messages */}
				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-4 pr-4">
						{startSessionMutation.isPending || opencodeChatQuery.isLoading ? (
							<div className="flex items-center gap-2 py-8">
								<svg
									aria-hidden="true"
									className="h-4 w-4 animate-spin text-muted-foreground"
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
								<span className="text-muted-foreground text-sm">
									{startSessionMutation.isPending
										? "Creating new session..."
										: "Loading messages..."}
								</span>
							</div>
						) : opencodeMessages.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-12 text-center">
								<p className="text-muted-foreground text-sm">No messages yet</p>
								<p className="text-muted-foreground/60 text-xs">
									Start a conversation with Agent about this ticket
								</p>
							</div>
						) : (
							<div className="relative space-y-4">
								<div className="absolute top-2 left-[7px] h-[calc(100%-16px)] w-px bg-border/60" />
								{groupMessages(opencodeMessages).map((group) => {
									if (group.type === "user") {
										const msg = group.message;
										return (
											<div className="relative pl-8" key={msg.id}>
												{/* Timeline dot - user */}
												<div className="absolute top-2 left-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-foreground ring-4 ring-background" />

												{/* Date header */}
												<div className="mb-2 flex items-center gap-2">
													<time className="font-medium text-muted-foreground text-xs">
														{new Date(msg.createdAt).toLocaleString(undefined, {
															dateStyle: "medium",
															timeStyle: "short",
														})}
													</time>
													<span className="text-muted-foreground text-xs uppercase tracking-wider">
														You
													</span>
												</div>

												{/* User message card */}
												<Card className="border-border/40 bg-card/50 py-1">
													<CardContent className="px-3 py-1">
														{msg.text && (
															<div className="prose prose-sm prose-invert prose-p:my-0 max-w-none prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-headings:text-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none">
																<Markdown>{msg.text}</Markdown>
															</div>
														)}
													</CardContent>
												</Card>
											</div>
										);
									}

									if (group.type === "tool-steps") {
										const firstMsg = group.messages[0];
										if (!firstMsg) return null;
										return (
											<ToolStepsBlock
												key={`tools-${firstMsg.id}`}
												model={firstMsg.model}
												timestamp={new Date(firstMsg.createdAt)}
												toolParts={group.toolParts}
											/>
										);
									}

									if (group.type === "response") {
										const msg = group.message;
										const toolParts =
											msg.parts?.filter(
												(p): p is ToolPart => p.type === "tool",
											) ?? [];
										const reasoningParts =
											msg.parts?.filter(
												(p): p is ReasoningPart => p.type === "reasoning",
											) ?? [];
										const hasReasoning =
											reasoningParts.length > 0 || msg.reasoning;
										const reasoningText =
											msg.reasoning ??
											reasoningParts
												.map((p) => p.text)
												.join("\n")
												.trim();

										return (
											<div className="relative pl-8" key={msg.id}>
												{/* Timeline dot - response (larger, prominent) */}
												<div className="absolute top-2 left-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500 ring-4 ring-background" />

												{/* Date header */}
												<div className="mb-2 flex items-center gap-2">
													<time className="font-medium text-muted-foreground text-xs">
														{new Date(msg.createdAt).toLocaleString(undefined, {
															dateStyle: "medium",
															timeStyle: "short",
														})}
													</time>
													<span className="font-medium text-emerald-600 text-xs uppercase tracking-wider dark:text-emerald-400">
														Response
													</span>
													{msg.model && (
														<Badge
															className="h-5 px-1.5 font-normal text-[10px]"
															variant="outline"
														>
															{msg.model}
														</Badge>
													)}
												</div>

												{/* Response card - prominent styling */}
												<Card className="border-emerald-500/20 bg-gradient-to-br from-card to-emerald-500/5 py-1 shadow-sm">
													<CardContent className="space-y-1 px-3 py-1">
														{hasReasoning && (
															<OpencodeReasoningDisplay
																reasoning={reasoningText}
															/>
														)}

														{msg.text && (
															<div className="prose prose-sm prose-invert prose-p:my-0 max-w-none prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-headings:text-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none">
																<Markdown>{msg.text}</Markdown>
															</div>
														)}

														{toolParts.length > 0 && (
															<OpencodeStepsCollapsible toolParts={toolParts} />
														)}
													</CardContent>
												</Card>
											</div>
										);
									}

									return null;
								})}
							</div>
						)}
						{sendOpencodeMutation.isPending && (
							<div className="flex justify-start">
								<div className="rounded-lg border border-border/60 bg-card/50 px-4 py-2.5">
									<div className="flex items-center gap-1.5">
										<div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
										<div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0.1s]" />
										<div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0.2s]" />
									</div>
								</div>
							</div>
						)}
						<div ref={opencodeChatEndRef} />
					</div>
				</ScrollArea>

				{/* Opencode chat input */}
				<div className="mt-4 space-y-2">
					{replyingToInsight && (
						<div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2">
							<span className="text-primary text-xs">
								Discussing Insight from{" "}
								{replyingToInsight.date.toLocaleString()}
							</span>
							<Button
								className="h-auto p-0 text-muted-foreground hover:text-foreground"
								onClick={() => onReplyingToInsightChange(null)}
								size="sm"
								variant="ghost"
							>
								<svg
									aria-hidden="true"
									className="h-4 w-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M6 18L18 6M6 6l12 12"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
									/>
								</svg>
							</Button>
						</div>
					)}
					<div className="flex gap-2">
						<Textarea
							className="min-h-11 resize-none text-sm"
							disabled={
								sendOpencodeMutation.isPending ||
								startSessionMutation.isPending ||
								!opencodeChatSessionId
							}
							onChange={(e) => setOpencodeChatInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSendOpencodeMessage();
								}
							}}
							placeholder={
								startSessionMutation.isPending
									? "Starting session..."
									: "Ask Agent about this ticket..."
							}
							value={opencodeChatInput}
						/>
						<Button
							className="h-auto px-4"
							disabled={
								!opencodeChatInput.trim() ||
								sendOpencodeMutation.isPending ||
								!opencodeChatSessionId
							}
							onClick={handleSendOpencodeMessage}
						>
							Send
						</Button>
					</div>
				</div>
			</div>
		</TabsContent>
	);
}
