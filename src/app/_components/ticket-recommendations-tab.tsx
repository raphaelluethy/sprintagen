"use client";

import { useMemo } from "react";
import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import type {
	MessagePart,
	ReasoningPart,
	ToolPart,
} from "@/server/tickets/opencode";
import { api } from "@/trpc/react";
import {
	OpencodeReasoningDisplay,
	OpencodeToolCallDisplay,
} from "./opencode-tool-call";
import type { OpencodeChatMessage } from "./types";

// Live analysis progress component for Ask Opencode
function LiveAnalysisProgress({
	steps,
}: {
	steps: { tool: string; title: string; status: string; id: string }[];
}) {
	// Map tool names to user-friendly descriptions
	const getToolDescription = (tool: string, title: string) => {
		if (title) return title;

		const toolDescriptions: Record<string, string> = {
			read: "Reading file...",
			write: "Writing file...",
			edit: "Editing file...",
			glob: "Searching for files...",
			grep: "Searching in files...",
			bash: "Running command...",
			list: "Listing directory...",
			search: "Searching codebase...",
			task: "Running task...",
		};

		const lowerTool = tool.toLowerCase();
		for (const [key, desc] of Object.entries(toolDescriptions)) {
			if (lowerTool.includes(key)) return desc;
		}
		return `Running ${tool}...`;
	};

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "completed":
				return (
					<svg
						aria-hidden="true"
						className="h-3.5 w-3.5 text-green-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							d="M5 13l4 4L19 7"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
						/>
					</svg>
				);
			case "error":
				return (
					<svg
						aria-hidden="true"
						className="h-3.5 w-3.5 text-destructive"
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
				);
			case "running":
			case "pending":
			default:
				return (
					<svg
						aria-hidden="true"
						className="h-3.5 w-3.5 animate-spin text-muted-foreground"
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
				);
		}
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<svg
					aria-hidden="true"
					className="h-4 w-4 animate-pulse text-foreground"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
					/>
				</svg>
				<span className="font-medium text-foreground text-sm">
					Analyzing with Agent...
				</span>
			</div>

			{steps.length === 0 ? (
				<div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-3 py-2">
					<svg
						aria-hidden="true"
						className="h-3.5 w-3.5 animate-spin text-muted-foreground"
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
						Starting analysis...
					</span>
				</div>
			) : (
				<div className="space-y-1.5">
					{steps.map((step, index) => (
						<div
							className={`flex items-center gap-2 rounded-md border px-3 py-2 transition-all ${
								index === steps.length - 1 &&
								(step.status === "running" || step.status === "pending")
									? "border-foreground/20 bg-foreground/5"
									: "border-border/60 bg-card/50"
							}`}
							key={step.id}
						>
							{getStatusIcon(step.status)}
							<span className="font-mono text-muted-foreground text-xs">
								{step.tool}
							</span>
							<span className="text-muted-foreground">→</span>
							<span className="flex-1 truncate text-sm">
								{getToolDescription(step.tool, step.title)}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function RecommendationsList({
	ticketId,
	onChatContext,
	onAgentContext,
}: {
	ticketId: string;
	onChatContext: (insight: string, date: Date) => void;
	onAgentContext: (insight: string, date: Date) => void;
}) {
	const {
		data,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
		isError,
	} = api.ticket.getRecommendations.useInfiniteQuery(
		{ ticketId, limit: 10 },
		{
			getNextPageParam: (lastPage) => lastPage.nextCursor,
		},
	);

	if (isLoading) {
		return (
			<div className="space-y-3">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="h-4 w-5/6" />
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-destructive text-sm">
					Failed to load recommendations
				</p>
			</div>
		);
	}

	const allItems = data?.pages.flatMap((page) => page.items) ?? [];

	if (allItems.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-muted-foreground text-sm">No recommendations yet</p>
				<p className="text-muted-foreground/60 text-xs">
					Click &ldquo;Regenerate&rdquo; to generate AI recommendations or
					&ldquo;Ask Agent&rdquo; for implementation analysis
				</p>
			</div>
		);
	}

	// Reverse to show oldest to newest (bottom)
	const reversedItems = [...allItems].reverse();

	return (
		<div className="space-y-6">
			{hasNextPage && (
				<div className="flex justify-center">
					<Button
						disabled={isFetchingNextPage}
						onClick={() => fetchNextPage()}
						size="sm"
						variant="ghost"
					>
						{isFetchingNextPage ? "Loading..." : "Load older insights"}
					</Button>
				</div>
			)}

			<div className="relative space-y-8 before:absolute before:top-2 before:left-[7px] before:h-[calc(100%-16px)] before:w-px before:bg-border/60">
				{reversedItems.map((item) => (
					<div className="relative pl-8" key={item.id}>
						{/* Timeline dot */}
						<div className="absolute top-2 left-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary ring-4 ring-background" />

						{/* Date header */}
						<div className="mb-2 flex items-center justify-between">
							<time className="font-medium text-muted-foreground text-xs">
								{new Date(item.createdAt).toLocaleString(undefined, {
									dateStyle: "medium",
									timeStyle: "short",
								})}
							</time>
							<Button
								className="h-6 px-2 text-xs"
								onClick={() => {
									const parts = [];
									if (item.recommendedSteps)
										parts.push(`Steps:\n${item.recommendedSteps}`);
									if (item.recommendedProgrammer)
										parts.push(`Assignee: ${item.recommendedProgrammer}`);
									if (item.opencodeSummary)
										parts.push(`Analysis:\n${item.opencodeSummary}`);
									onChatContext(parts.join("\n\n"), item.createdAt);
								}}
								size="sm"
								variant="ghost"
							>
								Discuss in Chat
							</Button>
							<Button
								className="h-6 px-2 text-xs"
								onClick={() => {
									const parts = [];
									if (item.recommendedSteps)
										parts.push(`Steps:\n${item.recommendedSteps}`);
									if (item.recommendedProgrammer)
										parts.push(`Assignee: ${item.recommendedProgrammer}`);
									if (item.opencodeSummary)
										parts.push(`Analysis:\n${item.opencodeSummary}`);
									onAgentContext(parts.join("\n\n"), item.createdAt);
								}}
								size="sm"
								variant="ghost"
							>
								Discuss with Agent
							</Button>
						</div>

						{/* Content Card */}
						<Card className="border-border/40 bg-card/50">
							<CardContent className="space-y-4 p-4">
								{item.recommendedSteps && (
									<div>
										<span className="text-muted-foreground text-xs uppercase tracking-wider">
											Recommended Steps
										</span>
										<div className="prose prose-sm prose-invert mt-2 max-w-none prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-headings:text-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none">
											<Markdown>{item.recommendedSteps}</Markdown>
										</div>
									</div>
								)}

								{item.recommendedProgrammer && (
									<div>
										<span className="text-muted-foreground text-xs uppercase tracking-wider">
											Recommended Assignee
										</span>
										<p className="mt-1 text-sm">{item.recommendedProgrammer}</p>
									</div>
								)}

								{item.opencodeSummary && (
									<>
										<div className="h-px bg-border/40" />
										<div>
											<span className="text-muted-foreground text-xs uppercase tracking-wider">
												Agent Analysis
											</span>
											<div className="prose prose-sm prose-invert mt-2 max-w-none prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-headings:text-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none">
												<Markdown>{item.opencodeSummary}</Markdown>
											</div>
										</div>
									</>
								)}

								{item.modelUsed && (
									<div className="mt-2 flex justify-end">
										<Badge
											className="h-5 px-1.5 font-normal text-[10px]"
											variant="outline"
										>
											{item.modelUsed}
										</Badge>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				))}
			</div>
		</div>
	);
}

interface TicketRecommendationsTabProps {
	ticketId: string;
	opencodeAvailable: boolean;
	askOpencodeInFlight: boolean;
	liveAnalysisSteps: {
		tool: string;
		title: string;
		status: string;
		id: string;
	}[];
	onAskOpencode: () => void;
	onGenerateRecommendations: () => void;
	onSwitchToChat: (insight: string, date: Date) => void;
	onSwitchToAgent: (insight: string, date: Date) => void;
}

export function TicketRecommendationsTab({
	ticketId,
	opencodeAvailable,
	askOpencodeInFlight,
	liveAnalysisSteps,
	onAskOpencode,
	onGenerateRecommendations,
	onSwitchToChat,
	onSwitchToAgent,
}: TicketRecommendationsTabProps) {
	const recommendationsMutation =
		api.ticket.generateRecommendations.useMutation();

	const sessionHistoryQuery = api.ticket.getSessionHistory.useQuery(
		{ ticketId },
		{
			enabled: !askOpencodeInFlight,
			staleTime: 30000,
		},
	);

	const archivedSessions = useMemo(
		() =>
			(sessionHistoryQuery.data ?? []).map((session) => ({
				...session,
				id: session.sessionId,
				sessionType: "chat" as const,
				startedAt: session.createdAt.getTime(),
				messages: ((session.messages ?? []) as OpencodeChatMessage[]).map(
					(message) => ({
						...message,
						createdAt: new Date(message.createdAt),
					}),
				),
			})),
		[sessionHistoryQuery.data],
	);

	return (
		<TabsContent
			className="mt-0 min-h-0 flex-1 overflow-auto px-6 py-4"
			value="agent-insight"
		>
			<div className="space-y-4">
				<div className="flex flex-wrap items-center justify-end gap-2">
					<Button
						disabled={!opencodeAvailable || askOpencodeInFlight}
						onClick={onAskOpencode}
						size="sm"
						variant="outline"
					>
						{askOpencodeInFlight ? "Analyzing..." : "Ask Agent"}
						{!opencodeAvailable && (
							<span className="ml-1 text-muted-foreground text-xs">
								(unavailable)
							</span>
						)}
					</Button>
					<Button
						disabled={recommendationsMutation.isPending}
						onClick={onGenerateRecommendations}
						size="sm"
						variant="outline"
					>
						{recommendationsMutation.isPending ? "Generating..." : "Regenerate"}
					</Button>
				</div>

				{recommendationsMutation.isPending ? (
					<div className="space-y-3">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-4 w-5/6" />
					</div>
				) : askOpencodeInFlight ? (
					<LiveAnalysisProgress steps={liveAnalysisSteps} />
				) : (
					<RecommendationsList
						onAgentContext={onSwitchToAgent}
						onChatContext={onSwitchToChat}
						ticketId={ticketId}
					/>
				)}

				{!askOpencodeInFlight && (
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-xs uppercase tracking-wider">
								Past Agent Sessions
							</span>
							{sessionHistoryQuery.isLoading && (
								<span className="text-muted-foreground text-xs">Loading…</span>
							)}
						</div>

						{sessionHistoryQuery.isError ? (
							<p className="text-destructive text-xs">
								Unable to load previous Agent sessions.
							</p>
						) : archivedSessions.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No previous Agent sessions for this ticket.
							</p>
						) : (
							<div className="space-y-3">
								{archivedSessions.map((session) => (
									<Card
										className="border-border/40 bg-card/40"
										key={session.id}
									>
										<CardContent className="space-y-3 p-4">
											<div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
												<span className="uppercase tracking-wider">
													{session.sessionType} · {session.status}
												</span>
												<span className="tabular-nums">
													{new Date(session.startedAt).toLocaleString()}
												</span>
											</div>

											<div className="space-y-2">
												{session.messages.length === 0 ? (
													<p className="text-muted-foreground text-sm">
														No messages archived for this session.
													</p>
												) : (
													session.messages.map((msg) => {
														const isUser = msg.role === "user";
														const toolParts =
															msg.parts?.filter(
																(p): p is ToolPart => p.type === "tool",
															) ?? [];
														const reasoningParts =
															msg.parts?.filter(
																(p): p is ReasoningPart =>
																	p.type === "reasoning",
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
															<div
																className={`flex ${isUser ? "justify-end" : "justify-start"}`}
																key={msg.id}
															>
																<div
																	className={`max-w-[80%] overflow-hidden rounded-lg px-4 py-2.5 ${
																		isUser
																			? "bg-foreground text-background"
																			: "border border-border/60 bg-card/50"
																	}`}
																>
																	{!isUser && hasReasoning && (
																		<OpencodeReasoningDisplay
																			reasoning={reasoningText}
																		/>
																	)}

																	{!isUser && toolParts.length > 0 && (
																		<div className="mb-3">
																			{toolParts.map((tool) => (
																				<OpencodeToolCallDisplay
																					key={tool.id}
																					tool={tool}
																				/>
																			))}
																		</div>
																	)}

																	{msg.text && (
																		<div className="prose prose-sm prose-invert prose-ol:my-1 prose-p:my-1 prose-pre:my-1 prose-ul:my-1 max-w-none overflow-x-auto prose-pre:overflow-x-auto prose-code:rounded prose-code:bg-background/10 prose-code:px-1 prose-code:py-0.5 text-inherit prose-code:before:content-none prose-code:after:content-none">
																			<Markdown>{msg.text}</Markdown>
																		</div>
																	)}

																	<div className="mt-1 flex items-center gap-2 text-xs tabular-nums opacity-50">
																		<span>
																			{new Date(
																				msg.createdAt,
																			).toLocaleTimeString()}
																		</span>
																		{msg.model && (
																			<Badge
																				className="h-4 px-1 font-normal text-[10px]"
																				variant="outline"
																			>
																				{msg.model}
																			</Badge>
																		)}
																	</div>
																</div>
															</div>
														);
													})
												)}
											</div>
										</CardContent>
									</Card>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</TabsContent>
	);
}
