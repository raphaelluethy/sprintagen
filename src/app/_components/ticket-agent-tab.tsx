"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
	MessagePart,
	ReasoningPart,
	ToolPart,
} from "@/server/tickets/opencode";
import { api } from "@/trpc/react";
import {
	OpencodeReasoningDisplay,
	OpencodeStepsCollapsible,
} from "./opencode-tool-call";
import type { OpencodeChatMessage } from "./types";

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
			refetchInterval: (query) => {
				const data = query.state.data;
				if (!data) return 1000;

				// Check session status - poll while not idle
				const isSessionActive = data.status?.type !== "idle";

				// Check if any tool calls are still running
				const hasRunningTools = data.toolCalls?.some(
					(t) => t.state.status === "pending" || t.state.status === "running",
				);

				// Poll every second while session is active or tools are running
				return isSessionActive || hasRunningTools ? 1000 : false;
			},
		},
	);

	const opencodeData = opencodeChatQuery.data;
	const opencodeMessages = [
		...(opencodeData?.messages ?? []),
		...optimisticOpencodeMessages,
	];

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
								{opencodeMessages.map((msg) => {
									const isUser = msg.role === "user";
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
											{/* Timeline dot */}
											<div
												className={`absolute top-2 left-0 h-3.5 w-3.5 rounded-full border-2 border-background ring-4 ring-background ${
													isUser ? "bg-foreground" : "bg-primary"
												}`}
											/>

											{/* Date header */}
											<div className="mb-2 flex items-center gap-2">
												<time className="font-medium text-muted-foreground text-xs">
													{new Date(msg.createdAt).toLocaleString(undefined, {
														dateStyle: "medium",
														timeStyle: "short",
													})}
												</time>
												<span className="text-muted-foreground text-xs uppercase tracking-wider">
													{isUser ? "You" : "Agent"}
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

											{/* Content Card */}
											<Card className="border-border/40 bg-card/50 py-1">
												<CardContent className="space-y-1 px-3 py-1">
													{/* Reasoning section (collapsible) for assistant messages */}
													{!isUser && hasReasoning && (
														<OpencodeReasoningDisplay
															reasoning={reasoningText}
														/>
													)}

													{/* Text content (final output) */}
													{msg.text && (
														<div className="prose prose-sm prose-invert prose-p:my-0 max-w-none prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-headings:text-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none">
															<Markdown>{msg.text}</Markdown>
														</div>
													)}

													{/* Tool calls collapsible section */}
													{!isUser && toolParts.length > 0 && (
														<OpencodeStepsCollapsible toolParts={toolParts} />
													)}
												</CardContent>
											</Card>
										</div>
									);
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
