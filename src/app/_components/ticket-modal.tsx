/** biome-ignore-all lint/nursery/useSortedClasses: <explanation> */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useOpencodeStream } from "@/hooks/useOpencodeStream";
import type {
	ticketMessages,
	ticketRankings,
	ticketRecommendations,
	tickets,
} from "@/server/db/schema";
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

type Ticket = typeof tickets.$inferSelect & {
	recommendations?: (typeof ticketRecommendations.$inferSelect)[];
	rankings?: (typeof ticketRankings.$inferSelect)[];
	messages?: (typeof ticketMessages.$inferSelect)[];
};

interface OpencodeChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	createdAt: Date;
	model?: string;
	toolCalls?: { toolName: string; toolCallId: string }[];
	parts?: MessagePart[];
	reasoning?: string;
	sessionId?: string;
}

interface TicketModalProps {
	ticket: Ticket | null;
	open: boolean;
	onClose: () => void;
	// Ask Opencode callback - lifted to parent so it persists when modal closes
	onAskOpencode: (ticketId: string) => void;
	// Callback to clear pending state when we detect completion client-side
	onAskOpencodeComplete?: (ticketId: string) => void;
	// Check if a specific ticket has a pending Ask Opencode run
	isAskOpencodePending: (ticketId: string) => boolean;
	// Get the session ID for a pending ticket (for SSE connection)
	getPendingSessionId: (ticketId: string) => string | null;
}

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
							className={`flex items-center gap-2 rounded-md border px-3 py-2 transition-all ${index === steps.length - 1 &&
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

const priorityStyles: Record<string, string> = {
	urgent: "bg-foreground text-background",
	high: "bg-foreground/80 text-background",
	medium: "bg-secondary text-secondary-foreground",
	low: "bg-secondary/60 text-muted-foreground",
};

const statusStyles: Record<string, string> = {
	open: "bg-secondary text-secondary-foreground",
	in_progress: "bg-foreground/10 text-foreground border border-border/60",
	review: "bg-foreground/10 text-foreground border border-border/60",
	done: "bg-secondary/60 text-muted-foreground",
	closed: "bg-secondary/40 text-muted-foreground",
};

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

			<div className="relative space-y-8 pl-4 before:absolute before:top-2 before:left-[7px] before:h-[calc(100%-16px)] before:w-px before:bg-border/60">
				{reversedItems.map((item) => (
					<div className="relative pl-6" key={item.id}>
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

export function TicketModal({
	ticket,
	open,
	onClose,
	onAskOpencode,
	onAskOpencodeComplete,
	isAskOpencodePending,
	getPendingSessionId,
}: TicketModalProps) {
	const [chatInput, setChatInput] = useState("");
	const [opencodeChatInput, setOpencodeChatInput] = useState("");
	const [activeTab, setActiveTab] = useState("details");
	const [optimisticOpencodeMessages, setOptimisticOpencodeMessages] = useState<
		OpencodeChatMessage[]
	>([]);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const opencodeChatEndRef = useRef<HTMLDivElement>(null);

	// Track the current Opencode chat session ID for this modal open
	// When the modal opens and the Opencode tab is accessed, we create a new session
	const [opencodeChatSessionId, setOpencodeChatSessionId] = useState<
		string | null
	>(null);
	// Track if we've already requested a session for this modal open
	const [sessionRequested, setSessionRequested] = useState(false);
	const completionNotifiedRef = useRef(false);

	// Chat context state
	const [replyingToInsight, setReplyingToInsight] = useState<{
		insight: string;
		date: Date;
	} | null>(null);

	// Get the pending session ID for this ticket (if any)
	const pendingSessionId = ticket?.id ? getPendingSessionId(ticket.id) : null;

	// Connect to SSE stream for live updates when there's a pending session
	const sseStream = useOpencodeStream(open ? pendingSessionId : null);

	// Reset session state when ticket changes
	const ticketId = ticket?.id;
	useEffect(() => {
		// Reset session state when ticket changes
		// Using ticketId to satisfy linter - we need to react to ticket changes
		void ticketId;
		setOpencodeChatSessionId(null);
		setSessionRequested(false);
		completionNotifiedRef.current = false;
	}, [ticketId]);

	// Fetch full ticket data with messages
	const ticketQuery = api.ticket.byId.useQuery(
		{ id: ticket?.id ?? "" },
		{ enabled: !!ticket?.id && open },
	);

	const fullTicket = ticketQuery.data ?? ticket;
	const messages = fullTicket?.messages ?? [];

	// Opencode status and chat queries
	const opencodeStatusQuery = api.ticket.getOpencodeStatus.useQuery(undefined, {
		enabled: open,
		staleTime: 30000, // Cache for 30 seconds
	});

	// Mutation to start a new Opencode session for the chat tab
	const startSessionMutation = api.ticket.startOpencodeSession.useMutation({
		onSuccess: (data) => {
			setOpencodeChatSessionId(data.sessionId);
		},
	});

	// Start a new session when Opencode tab is first accessed
	useEffect(() => {
		if (
			activeTab === "opencode" &&
			ticket?.id &&
			open &&
			!sessionRequested &&
			opencodeStatusQuery.data?.available
		) {
			setSessionRequested(true);
			startSessionMutation.mutate({ ticketId: ticket.id });
		}
	}, [
		activeTab,
		ticket?.id,
		open,
		sessionRequested,
		opencodeStatusQuery.data?.available,
		startSessionMutation,
	]);

	const opencodeChatQuery = api.ticket.getOpencodeChat.useQuery(
		{
			ticketId: ticket?.id ?? "",
			sessionId: opencodeChatSessionId ?? undefined,
		},
		{
			enabled:
				!!ticket?.id &&
				open &&
				activeTab === "opencode" &&
				!!opencodeChatSessionId,
		},
	);

	// Extract messages from the new response shape
	const opencodeData = opencodeChatQuery.data;
	const opencodeMessages = [
		...(opencodeData?.messages ?? []),
		...optimisticOpencodeMessages,
	];
	// Track if this is a freshly created session (e.g., after server restart)
	const _isNewOpencodeSession = opencodeData?.isNewSession ?? false;

	// Mutations
	const chatMutation = api.ticket.chat.useMutation({
		onSuccess: () => {
			setChatInput("");
			void ticketQuery.refetch();
		},
	});

	const recommendationsMutation =
		api.ticket.generateRecommendations.useMutation({
			onSuccess: () => {
				void ticketQuery.refetch();
			},
		});

	const clearChatMutation = api.ticket.clearChat.useMutation({
		onSuccess: () => {
			void ticketQuery.refetch();
		},
	});

	// Opencode mutations
	const sendOpencodeMutation = api.ticket.sendOpencodeChatMessage.useMutation({
		onMutate: (variables) => {
			// Add optimistic user message
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

	// State for tracking live analysis steps during "Ask Opencode"
	const [liveAnalysisSteps, setLiveAnalysisSteps] = useState<
		{ tool: string; title: string; status: string; id: string }[]
	>([]);

	// Determine if this ticket has a pending Ask Opencode run (from parent)
	const thisTicketAskPending = ticket?.id
		? isAskOpencodePending(ticket.id)
		: false;

	const askRunCompleted =
		thisTicketAskPending &&
		(sseStream.status === "completed" || sseStream.status === "error");
	const askOpencodeInFlight = thisTicketAskPending && !askRunCompleted;

	const sessionHistoryQuery = api.ticket.getSessionHistory.useQuery(
		{ ticketId: ticket?.id ?? "" },
		{
			enabled: !!ticket?.id && open && !askOpencodeInFlight,
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

	useEffect(() => {
		if (
			askRunCompleted &&
			!askOpencodeInFlight &&
			ticket?.id &&
			!completionNotifiedRef.current
		) {
			completionNotifiedRef.current = true;
			onAskOpencodeComplete?.(ticket.id);
		}
	}, [askOpencodeInFlight, askRunCompleted, onAskOpencodeComplete, ticket?.id]);

	// Use SSE stream data for live analysis steps when available
	useEffect(() => {
		if (sseStream.toolCalls && sseStream.toolCalls.length > 0) {
			// Transform SSE tool calls to the expected format
			const steps = sseStream.toolCalls.map((t) => ({
				id: t.id,
				tool: t.tool,
				title:
					t.state.status === "completed" || t.state.status === "running"
						? (t.state.title ?? "")
						: "",
				status: t.state.status,
			}));
			setLiveAnalysisSteps(steps);
		}
	}, [sseStream.toolCalls]);

	// Reset live steps when the analysis completes
	useEffect(() => {
		if (!askOpencodeInFlight && liveAnalysisSteps.length > 0) {
			// Clear live steps after a brief delay to show completion
			const timeout = setTimeout(() => setLiveAnalysisSteps([]), 500);
			return () => clearTimeout(timeout);
		}
	}, [askOpencodeInFlight, liveAnalysisSteps.length]);

	// Scroll to bottom when messages change
	useEffect(() => {
		if (messages.length > 0) {
			chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	});

	// Scroll to bottom when opencode messages change
	useEffect(() => {
		if (opencodeMessages.length > 0) {
			opencodeChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	});

	const handleSendMessage = () => {
		if (!chatInput.trim() || !ticket?.id) return;

		let messageToSend = chatInput.trim();
		if (replyingToInsight) {
			messageToSend = `Context (Insight from ${replyingToInsight.date.toLocaleString()}):\n> ${replyingToInsight.insight.replace(/\n/g, "\n> ")}\n\n${messageToSend}`;
			setReplyingToInsight(null);
		}

		chatMutation.mutate({
			ticketId: ticket.id,
			message: messageToSend,
		});
	};

	const handleSendOpencodeMessage = () => {
		if (!opencodeChatInput.trim() || !ticket?.id || !opencodeChatSessionId)
			return;

		let messageToSend = opencodeChatInput.trim();
		if (replyingToInsight) {
			messageToSend = `Context (Insight from ${replyingToInsight.date.toLocaleString()}):\n> ${replyingToInsight.insight.replace(/\n/g, "\n> ")}\n\n${messageToSend}`;
			setReplyingToInsight(null);
		}

		sendOpencodeMutation.mutate({
			ticketId: ticket.id,
			message: messageToSend,
			sessionId: opencodeChatSessionId,
		});
	};

	const handleAskOpencode = () => {
		if (!ticket?.id) return;
		onAskOpencode(ticket.id);
	};

	const handleGenerateRecommendations = () => {
		if (!ticket?.id) return;
		recommendationsMutation.mutate({
			ticketId: ticket.id,
			availableProgrammers: [], // Could be populated from team data
		});
	};

	const latestRanking = fullTicket?.rankings?.[0];
	const opencodeAvailable = opencodeStatusQuery.data?.available ?? false;

	if (!ticket) return null;

	return (
		<Dialog onOpenChange={(o) => !o && onClose()} open={open}>
			<DialogContent
				className="flex flex-col gap-0 overflow-hidden border-border/40 bg-background p-0"
				style={{
					width: "75dvw",
					height: "90dvh",
					maxWidth: "none",
					maxHeight: "none",
				}}
			>
				<DialogHeader className="shrink-0 border-border/40 border-b px-6 py-4">
					<DialogTitle className="flex items-start justify-between gap-4">
						<div className="min-w-0 flex-1">
							<h2 className="truncate font-semibold text-lg">{ticket.title}</h2>
							<div className="mt-2 flex flex-wrap items-center gap-2">
								<Badge
									className={`font-normal text-xs ${statusStyles[ticket.status]}`}
									variant="secondary"
								>
									{ticket.status.replace("_", " ")}
								</Badge>
								<Badge
									className={`font-normal text-xs ${priorityStyles[ticket.priority ?? "medium"]}`}
									variant="secondary"
								>
									{ticket.priority}
								</Badge>
								<span className="text-muted-foreground text-xs capitalize">
									via {ticket.provider}
								</span>
								{ticket.externalId && (
									<span className="font-mono text-muted-foreground text-xs">
										#{ticket.externalId}
									</span>
								)}
							</div>
						</div>
						{latestRanking && (
							<div className="shrink-0 text-right">
								<div className="text-muted-foreground text-xs uppercase tracking-wider">
									AI Score
								</div>
								<div className="font-light font-mono text-2xl tabular-nums">
									{latestRanking.overallScore.toFixed(1)}
								</div>
							</div>
						)}
					</DialogTitle>
				</DialogHeader>

				<Tabs
					className="flex min-h-0 flex-1 flex-col"
					onValueChange={setActiveTab}
					value={activeTab}
				>
					<TabsList className="mx-6 mt-4 grid w-fit grid-cols-4 bg-secondary/50">
						<TabsTrigger className="text-xs" value="details">
							Details
						</TabsTrigger>
						<TabsTrigger className="text-xs" value="recommendations">
							AI Insights
						</TabsTrigger>
						<TabsTrigger className="text-xs" value="chat">
							Chat
						</TabsTrigger>
						<TabsTrigger className="text-xs" value="opencode">
							Agent
						</TabsTrigger>
					</TabsList>

					<TabsContent
						className="mt-0 min-h-0 flex-1 overflow-auto px-6 py-4"
						value="details"
					>
						<div className="space-y-6">
							{/* Metadata */}
							<div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
								<div>
									<span className="text-muted-foreground text-xs uppercase tracking-wider">
										Assignee
									</span>
									<p className="mt-1">{ticket.assignee ?? "Unassigned"}</p>
								</div>
								<div>
									<span className="text-muted-foreground text-xs uppercase tracking-wider">
										Created
									</span>
									<p className="mt-1 tabular-nums">
										{new Date(ticket.createdAt).toLocaleDateString()}
									</p>
								</div>
								{ticket.updatedAt && (
									<div>
										<span className="text-muted-foreground text-xs uppercase tracking-wider">
											Updated
										</span>
										<p className="mt-1 tabular-nums">
											{new Date(ticket.updatedAt).toLocaleDateString()}
										</p>
									</div>
								)}
								{ticket.lastSyncedAt && (
									<div>
										<span className="text-muted-foreground text-xs uppercase tracking-wider">
											Last Synced
										</span>
										<p className="mt-1 tabular-nums">
											{new Date(ticket.lastSyncedAt).toLocaleDateString()}
										</p>
									</div>
								)}
							</div>

							{/* Labels */}
							{ticket.labels && ticket.labels.length > 0 && (
								<div>
									<span className="text-muted-foreground text-xs uppercase tracking-wider">
										Labels
									</span>
									<div className="mt-2 flex flex-wrap gap-1.5">
										{ticket.labels.map((label) => (
											<Badge
												className="font-normal text-xs"
												key={label}
												variant="outline"
											>
												{label}
											</Badge>
										))}
									</div>
								</div>
							)}

							<div className="h-px bg-border/40" />

							{/* Description */}
							<div>
								<span className="text-muted-foreground text-xs uppercase tracking-wider">
									Description
								</span>
								<div className="prose prose-sm prose-invert mt-3 max-w-none prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-headings:text-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none">
									<Markdown>
										{ticket.description || "No description provided."}
									</Markdown>
								</div>
							</div>

							{/* AI Ranking Details */}
							{latestRanking && (
								<>
									<div className="h-px bg-border/40" />
									<div>
										<span className="text-muted-foreground text-xs uppercase tracking-wider">
											AI Analysis
										</span>
										<div className="mt-3 grid grid-cols-3 gap-3">
											<Card className="border-border/40 bg-card/50">
												<CardContent className="p-4 text-center">
													<div className="font-light font-mono text-2xl tabular-nums">
														{latestRanking.urgencyScore.toFixed(1)}
													</div>
													<div className="mt-1 text-muted-foreground text-xs uppercase tracking-wider">
														Urgency
													</div>
												</CardContent>
											</Card>
											<Card className="border-border/40 bg-card/50">
												<CardContent className="p-4 text-center">
													<div className="font-light font-mono text-2xl tabular-nums">
														{latestRanking.impactScore.toFixed(1)}
													</div>
													<div className="mt-1 text-muted-foreground text-xs uppercase tracking-wider">
														Impact
													</div>
												</CardContent>
											</Card>
											<Card className="border-border/40 bg-card/50">
												<CardContent className="p-4 text-center">
													<div className="font-light font-mono text-2xl tabular-nums">
														{latestRanking.complexityScore.toFixed(1)}
													</div>
													<div className="mt-1 text-muted-foreground text-xs uppercase tracking-wider">
														Complexity
													</div>
												</CardContent>
											</Card>
										</div>
										{latestRanking.reasoning && (
											<p className="mt-3 text-muted-foreground text-sm">
												{latestRanking.reasoning}
											</p>
										)}
									</div>
								</>
							)}
						</div>
					</TabsContent>

					<TabsContent
						className="mt-0 min-h-0 flex-1 overflow-auto px-6 py-4"
						value="recommendations"
					>
						<div className="space-y-4">
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									disabled={!opencodeAvailable || askOpencodeInFlight}
									onClick={handleAskOpencode}
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
									onClick={handleGenerateRecommendations}
									size="sm"
									variant="outline"
								>
									{recommendationsMutation.isPending
										? "Generating..."
										: "Regenerate"}
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
									onAgentContext={(insight, date) => {
										setActiveTab("opencode");
										setReplyingToInsight({ insight, date });
									}}
									onChatContext={(insight, date) => {
										setActiveTab("chat");
										setReplyingToInsight({ insight, date });
									}}
									ticketId={ticket.id}
								/>
							)}

							{!askOpencodeInFlight && (
								<div className="space-y-3">
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground text-xs uppercase tracking-wider">
											Past Agent Sessions
										</span>
										{sessionHistoryQuery.isLoading && (
											<span className="text-muted-foreground text-xs">
												Loading…
											</span>
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
																				className={`max-w-[80%] overflow-hidden rounded-lg px-4 py-2.5 ${isUser
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

					<TabsContent
						className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
						value="chat"
					>
						<div className="flex min-h-0 flex-1 flex-col px-6 py-4">
							{/* Chat messages */}
							<ScrollArea className="min-h-0 flex-1">
								<div className="space-y-3 pr-4">
									{messages.length === 0 ? (
										<div className="flex flex-col items-center justify-center py-12 text-center">
											<p className="text-muted-foreground text-sm">
												No messages yet
											</p>
											<p className="text-muted-foreground/60 text-xs">
												Start a conversation about this ticket
											</p>
										</div>
									) : (
										messages.map((msg) => (
											<div
												className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
												key={msg.id}
											>
												<div
													className={`max-w-[80%] overflow-hidden rounded-lg px-4 py-2.5 ${msg.role === "user"
															? "bg-foreground text-background"
															: "bg-card/50"
														}`}
												>
													<div className="prose prose-sm prose-invert prose-ol:my-1 prose-p:my-1 prose-pre:my-1 prose-ul:my-1 max-w-none overflow-x-auto prose-pre:overflow-x-auto prose-code:rounded prose-code:bg-background/10 prose-code:px-1 prose-code:py-0.5 text-inherit prose-code:before:content-none prose-code:after:content-none">
														<Markdown>{msg.content}</Markdown>
													</div>
													<p className="mt-1 text-xs tabular-nums opacity-50">
														{new Date(msg.createdAt).toLocaleTimeString()}
													</p>
												</div>
											</div>
										))
									)}
									{chatMutation.isPending && (
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
									<div ref={chatEndRef} />
								</div>
							</ScrollArea>

							{/* Chat input */}
							<div className="mt-4 space-y-2">
								{replyingToInsight && (
									<div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2">
										<span className="text-primary text-xs">
											Discussing Insight from{" "}
											{replyingToInsight.date.toLocaleString()}
										</span>
										<Button
											className="h-auto p-0 text-muted-foreground hover:text-foreground"
											onClick={() => setReplyingToInsight(null)}
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
										disabled={chatMutation.isPending}
										onChange={(e) => setChatInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && !e.shiftKey) {
												e.preventDefault();
												handleSendMessage();
											}
										}}
										placeholder="Ask about this ticket..."
										value={chatInput}
									/>
									<Button
										className="h-auto px-4"
										disabled={!chatInput.trim() || chatMutation.isPending}
										onClick={handleSendMessage}
									>
										Send
									</Button>
								</div>
								{messages.length > 0 && (
									<Button
										className="h-7 text-xs"
										disabled={clearChatMutation.isPending}
										onClick={() =>
											ticket?.id &&
											clearChatMutation.mutate({ ticketId: ticket.id })
										}
										size="sm"
										variant="ghost"
									>
										Clear chat history
									</Button>
								)}
							</div>
						</div>
					</TabsContent>

					<TabsContent
						className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
						value="opencode"
					>
						<div className="flex min-h-0 flex-1 flex-col px-6 py-4">
							{!opencodeAvailable ? (
								<div className="flex flex-col items-center justify-center py-12 text-center">
									<p className="text-muted-foreground text-sm">
										Agent is not available
									</p>
									<p className="text-muted-foreground/60 text-xs">
										Make sure the Agent server is running and configured
									</p>
								</div>
							) : (
								<>
									{/* Opencode chat messages */}
									<ScrollArea className="min-h-0 flex-1">
										<div className="space-y-6 pr-4">
											{startSessionMutation.isPending ||
												opencodeChatQuery.isLoading ? (
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
													<p className="text-muted-foreground text-sm">
														No messages yet
													</p>
													<p className="text-muted-foreground/60 text-xs">
														Start a conversation with Agent about this ticket
													</p>
												</div>
											) : (
												<div className="relative space-y-4">
													<div className="absolute left-[7px] top-2 h-[calc(100%-16px)] w-px bg-border/60" />
													{opencodeMessages.map((msg) => {
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
															<div className="relative pl-6" key={msg.id}>
																{/* Timeline dot */}
																<div
																	className={`absolute left-0 top-2 h-3.5 w-3.5 rounded-full border-2 border-background ring-4 ring-background ${isUser ? "bg-foreground" : "bg-primary"
																		}`}
																/>

																{/* Date header */}
																<div className="mb-2 flex items-center gap-2">
																	<time className="font-medium text-muted-foreground text-xs">
																		{new Date(msg.createdAt).toLocaleString(
																			undefined,
																			{
																				dateStyle: "medium",
																				timeStyle: "short",
																			},
																		)}
																	</time>
																	<span className="text-muted-foreground text-xs uppercase tracking-wider">
																		{isUser ? "You" : "Agent"}
																	</span>
																	{msg.model && (
																		<Badge
																			className="h-5 px-1.5 font-normal text-[10px] text-foreground"
																			variant="secondary"
																		>
																			{msg.model}
																		</Badge>
																	)}
																</div>

																{/* Content Card */}
																<Card className="border-border/40 bg-card/50">
																	<CardContent className="space-y-1 px-3 py-1.5">
																		{/* Reasoning section (collapsible) for assistant messages */}
																		{!isUser && hasReasoning && (
																			<OpencodeReasoningDisplay
																				reasoning={reasoningText}
																			/>
																		)}

																		{/* Tool calls (for assistant messages) */}
																		{!isUser && toolParts.length > 0 && (
																			<div>
																				<span className="text-muted-foreground text-xs uppercase tracking-wider">
																					Tool Calls
																				</span>
																				<div className="mt-1 space-y-1">
																					{toolParts.map((tool) => (
																						<OpencodeToolCallDisplay
																							key={tool.id}
																							tool={tool}
																						/>
																					))}
																				</div>
																			</div>
																		)}

																		{/* Text content */}
																		{!isUser &&
																			toolParts.length > 0 &&
																			msg.text && (
																				<div className="h-px bg-border/40" />
																			)}
																		{msg.text && (
																			<div className="prose prose-sm prose-invert max-w-none prose-p:my-0 prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-headings:text-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none">
																				<Markdown>{msg.text}</Markdown>
																			</div>
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
													onClick={() => setReplyingToInsight(null)}
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
								</>
							)}
						</div>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
