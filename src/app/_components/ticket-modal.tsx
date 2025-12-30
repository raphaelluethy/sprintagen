"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOpencodeSSE } from "@/hooks/useOpencodeSSE";
import type {
	ticketMessages,
	ticketRankings,
	ticketRecommendations,
	tickets,
} from "@/server/db/schema";
import { api } from "@/trpc/react";
import { PRIORITY_STYLES, STATUS_STYLES } from "./constants";
import { TicketAgentTab } from "./ticket-agent-tab";
import { TicketChatTab } from "./ticket-chat-tab";
import { TicketDetailsTab } from "./ticket-details-tab";
import { TicketRecommendationsTab } from "./ticket-recommendations-tab";

type Ticket = typeof tickets.$inferSelect & {
	recommendations?: (typeof ticketRecommendations.$inferSelect)[];
	rankings?: (typeof ticketRankings.$inferSelect)[];
	messages?: (typeof ticketMessages.$inferSelect)[];
};

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

export function TicketModal({
	ticket,
	open,
	onClose,
	onAskOpencode,
	onAskOpencodeComplete,
	isAskOpencodePending,
	getPendingSessionId,
}: TicketModalProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const updateSearchParams = (updates: Record<string, string | null>) => {
		const params = new URLSearchParams(searchParams.toString());
		for (const [key, value] of Object.entries(updates)) {
			if (value === null) {
				params.delete(key);
			} else {
				params.set(key, value);
			}
		}
		router.push(`${pathname}?${params.toString()}`, { scroll: false });
	};

	const tabParam = searchParams.get("tab");
	const validTabs = ["details", "agent-insight", "chat", "agent-chat"] as const;
	const activeTab =
		tabParam && validTabs.includes(tabParam as (typeof validTabs)[number])
			? (tabParam as (typeof validTabs)[number])
			: "details";

	const setActiveTab = (tab: string) => {
		updateSearchParams({ tab });
	};

	const [opencodeChatSessionId, setOpencodeChatSessionId] = useState<
		string | null
	>(null);
	const completionNotifiedRef = useRef(false);

	const [replyingToInsight, setReplyingToInsight] = useState<{
		insight: string;
		date: Date;
	} | null>(null);

	const pendingSessionId = ticket?.id ? getPendingSessionId(ticket.id) : null;

	const sseStream = useOpencodeSSE(
		pendingSessionId,
		open && !!pendingSessionId,
	);

	const ticketId = ticket?.id;
	useEffect(() => {
		void ticketId;
		setOpencodeChatSessionId(null);
		completionNotifiedRef.current = false;
	}, [ticketId]);

	const ticketQuery = api.ticket.byId.useQuery(
		{ id: ticket?.id ?? "" },
		{ enabled: !!ticket?.id && open },
	);

	const fullTicket = ticketQuery.data ?? ticket;
	const messages = fullTicket?.messages ?? [];

	const opencodeStatusQuery = api.ticket.getOpencodeStatus.useQuery(undefined, {
		enabled: open,
		staleTime: 30000,
	});

	const recommendationsMutation =
		api.ticket.generateRecommendations.useMutation({
			onSuccess: () => {
				ticketQuery.refetch().catch((error) => {
					console.error("[TicketModal] Failed to refetch ticket data:", error);
				});
			},
		});

	const [liveAnalysisSteps, setLiveAnalysisSteps] = useState<
		{ tool: string; title: string; status: string; id: string }[]
	>([]);

	const thisTicketAskPending = ticket?.id
		? isAskOpencodePending(ticket.id)
		: false;

	const askRunCompleted =
		thisTicketAskPending &&
		(sseStream.status === "completed" || sseStream.status === "error");
	const askOpencodeInFlight = thisTicketAskPending && !askRunCompleted;

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
		// eslint-disable-next-line react-hooks/exhaustive-deps
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

	useEffect(() => {
		if (!askOpencodeInFlight && liveAnalysisSteps.length > 0) {
			const timeout = setTimeout(() => setLiveAnalysisSteps([]), 500);
			return () => clearTimeout(timeout);
		}
	}, [askOpencodeInFlight, liveAnalysisSteps.length]);

	const handleAskOpencode = () => {
		if (!ticket?.id) return;
		onAskOpencode(ticket.id);
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
									className={`font-normal text-xs ${STATUS_STYLES[ticket.status]}`}
									variant="secondary"
								>
									{ticket.status.replace("_", " ")}
								</Badge>
								<Badge
									className={`font-normal text-xs ${PRIORITY_STYLES[ticket.priority ?? "medium"]}`}
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
						<TabsTrigger className="text-xs" value="agent-insight">
							AI Insights
						</TabsTrigger>
						<TabsTrigger className="text-xs" value="chat">
							Chat
						</TabsTrigger>
						<TabsTrigger className="text-xs" value="agent-chat">
							Agent
						</TabsTrigger>
					</TabsList>

					{fullTicket && (
						<TicketDetailsTab
							latestRanking={latestRanking}
							ticket={fullTicket}
						/>
					)}

					<TicketRecommendationsTab
						askOpencodeInFlight={askOpencodeInFlight}
						liveAnalysisSteps={liveAnalysisSteps}
						onAskOpencode={handleAskOpencode}
						onGenerateRecommendations={() => {
							if (!ticket?.id) return;
							recommendationsMutation.mutate({
								ticketId: ticket.id,
								availableProgrammers: [],
							});
						}}
						onSwitchToAgent={(insight, date) => {
							setActiveTab("agent-chat");
							setReplyingToInsight({ insight, date });
						}}
						onSwitchToChat={(insight, date) => {
							setActiveTab("chat");
							setReplyingToInsight({ insight, date });
						}}
						opencodeAvailable={opencodeAvailable}
						ticketId={ticket.id}
					/>

					<TicketChatTab
						messages={messages}
						onReplyingToInsightChange={setReplyingToInsight}
						onTicketRefetch={() => {
							ticketQuery.refetch().catch((error) => {
								console.error(
									"[TicketModal] Failed to refetch ticket data:",
									error,
								);
							});
						}}
						replyingToInsight={replyingToInsight}
						ticketId={ticket.id}
					/>

					<TicketAgentTab
						activeTab={activeTab}
						onReplyingToInsightChange={setReplyingToInsight}
						onSessionIdChange={setOpencodeChatSessionId}
						open={open}
						opencodeAvailable={opencodeAvailable}
						opencodeChatSessionId={opencodeChatSessionId}
						replyingToInsight={replyingToInsight}
						ticketId={ticket.id}
					/>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
