"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOpencodeSSE } from "@/hooks/useOpencodeSSE";
import type {
	ticketMessages,
	ticketRankings,
	ticketRecommendations,
	tickets,
} from "@/server/db/schema";
import { api } from "@/trpc/react";
import {
	PRIORITY_ICONS,
	PRIORITY_STYLES,
	PROVIDER_STYLES,
	STATUS_STYLES,
} from "./constants";
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

	const handleAskOpencode = () => {
		if (!ticket?.id) return;
		onAskOpencode(ticket.id);
	};

	const latestRanking = fullTicket?.rankings?.[0];
	const opencodeAvailable = opencodeStatusQuery.data?.available ?? false;

	if (!ticket) return null;

	return (
		<TooltipProvider delayDuration={200}>
			<Dialog onOpenChange={(o) => !o && onClose()} open={open}>
				<DialogContent
					className="flex flex-col gap-0 overflow-hidden border-border/30 bg-gradient-to-b from-background to-background/95 p-0 shadow-2xl"
					style={{
						width: "75dvw",
						height: "90dvh",
						maxWidth: "none",
						maxHeight: "none",
					}}
				>
					{/* Enhanced header */}
					<DialogHeader className="shrink-0 border-border/30 border-b bg-muted/20 px-6 py-5">
						<DialogTitle className="flex items-start justify-between gap-6">
							<div className="min-w-0 flex-1 space-y-3">
								{/* Title row with priority indicator */}
								<div className="flex items-start gap-3">
									<div
										className={`mt-1.5 h-5 w-1.5 shrink-0 rounded-full ${
											ticket.priority === "urgent"
												? "bg-red-400"
												: ticket.priority === "high"
													? "bg-orange-400"
													: ticket.priority === "medium"
														? "bg-amber-400"
														: "bg-slate-400"
										}`}
									/>
									<Tooltip>
										<TooltipTrigger asChild>
											<h2 className="line-clamp-2 font-semibold text-xl leading-tight">
												{ticket.title}
											</h2>
										</TooltipTrigger>
										<TooltipContent className="max-w-lg" side="bottom">
											{ticket.title}
										</TooltipContent>
									</Tooltip>
								</div>

								{/* Metadata row */}
								<div className="flex flex-wrap items-center gap-3">
									<Badge
										className={`text-[11px] font-medium ${STATUS_STYLES[ticket.status]}`}
										variant="outline"
									>
										{ticket.status.replace("_", " ")}
									</Badge>
									<Badge
										className={`text-[11px] font-medium ${PRIORITY_STYLES[ticket.priority ?? "medium"]}`}
										variant="outline"
									>
										<span className="mr-1 opacity-70">
											{PRIORITY_ICONS[ticket.priority ?? "medium"]}
										</span>
										{ticket.priority}
									</Badge>

									<Separator className="h-4" orientation="vertical" />

									<span
										className={`flex items-center gap-1.5 text-xs capitalize ${PROVIDER_STYLES[ticket.provider] ?? "text-muted-foreground"}`}
									>
										{ticket.provider === "jira" && (
											<svg
												className="h-3.5 w-3.5"
												fill="currentColor"
												viewBox="0 0 24 24"
											>
												<path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.362 4.362 0 004.34 4.34h1.8v1.72a4.362 4.362 0 004.34 4.34V7.63a.84.84 0 00-.83-.83H6.77zM2 11.6c0 2.4 1.95 4.34 4.35 4.35h1.78v1.7c.01 2.39 1.95 4.34 4.35 4.35v-9.57a.84.84 0 00-.84-.84H2z" />
											</svg>
										)}
										{ticket.provider === "linear" && (
											<svg
												className="h-3.5 w-3.5"
												fill="currentColor"
												viewBox="0 0 24 24"
											>
												<path d="M3 15.055v-.684c.126.053.255.1.39.14a2.94 2.94 0 001.53-.06l9.56-2.89a.96.96 0 00.68-.92v-1.3a.96.96 0 00-.68-.92l-9.56-2.89a2.94 2.94 0 00-1.53-.06c-.135.04-.264.087-.39.14v-.684A2.945 2.945 0 005.945 2H18.055A2.945 2.945 0 0021 4.945v14.11A2.945 2.945 0 0018.055 22H5.945A2.945 2.945 0 003 19.055v-4z" />
											</svg>
										)}
										via {ticket.provider}
									</span>

									{ticket.externalId && (
										<>
											<span className="text-muted-foreground/30">·</span>
											<span className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
												#{ticket.externalId}
											</span>
										</>
									)}

									{ticket.assignee && (
										<>
											<span className="text-muted-foreground/30">·</span>
											<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
												<svg
													className="h-3.5 w-3.5"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
													/>
												</svg>
												{ticket.assignee}
											</span>
										</>
									)}
								</div>
							</div>

							{/* AI Score panel */}
							{latestRanking && (
								<div className="shrink-0 rounded-lg border border-border/30 bg-card/50 p-4 text-center">
									<div className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
										AI Priority
									</div>
									<div
										className={`font-mono text-3xl font-semibold tabular-nums ${
											latestRanking.overallScore >= 7
												? "text-red-400"
												: latestRanking.overallScore >= 5
													? "text-amber-400"
													: "text-emerald-400"
										}`}
									>
										{latestRanking.overallScore.toFixed(1)}
									</div>
									<div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
										<span>U:{latestRanking.urgencyScore.toFixed(0)}</span>
										<span>I:{latestRanking.impactScore.toFixed(0)}</span>
										<span>C:{latestRanking.complexityScore.toFixed(0)}</span>
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
						{/* Enhanced tab navigation */}
						<div className="shrink-0 border-border/20 border-b bg-muted/10 px-6 pt-2">
							<TabsList className="h-auto gap-1 bg-transparent p-0">
								<TabsTrigger
									className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
									value="details"
								>
									<svg
										className="mr-1.5 h-3.5 w-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
										/>
									</svg>
									Details
								</TabsTrigger>
								<TabsTrigger
									className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
									value="agent-insight"
								>
									<svg
										className="mr-1.5 h-3.5 w-3.5"
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
									AI Insights
								</TabsTrigger>
								<TabsTrigger
									className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
									value="chat"
								>
									<svg
										className="mr-1.5 h-3.5 w-3.5"
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
									Chat
								</TabsTrigger>
								<TabsTrigger
									className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
									value="agent-chat"
								>
									<svg
										className="mr-1.5 h-3.5 w-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
										/>
									</svg>
									Agent
								</TabsTrigger>
							</TabsList>
						</div>

						{fullTicket && (
							<TicketDetailsTab
								latestRanking={latestRanking}
								ticket={fullTicket}
							/>
						)}

						<TicketRecommendationsTab
							askOpencodeInFlight={askOpencodeInFlight}
							liveToolCalls={sseStream.toolCalls}
							onAskOpencode={handleAskOpencode}
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
		</TooltipProvider>
	);
}
