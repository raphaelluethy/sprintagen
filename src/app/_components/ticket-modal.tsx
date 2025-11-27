"use client";

import { useEffect, useRef, useState } from "react";
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
import type {
	ticketMessages,
	ticketRankings,
	ticketRecommendations,
	tickets,
} from "@/server/db/schema";
import { api } from "@/trpc/react";

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
}

interface TicketModalProps {
	ticket: Ticket | null;
	open: boolean;
	onClose: () => void;
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

export function TicketModal({ ticket, open, onClose }: TicketModalProps) {
	const [chatInput, setChatInput] = useState("");
	const [opencodeChatInput, setOpencodeChatInput] = useState("");
	const [activeTab, setActiveTab] = useState("details");
	const [optimisticOpencodeMessages, setOptimisticOpencodeMessages] = useState<
		OpencodeChatMessage[]
	>([]);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const opencodeChatEndRef = useRef<HTMLDivElement>(null);

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

	const opencodeChatQuery = api.ticket.getOpencodeChat.useQuery(
		{ ticketId: ticket?.id ?? "" },
		{
			enabled: !!ticket?.id && open && activeTab === "opencode",
		},
	);

	const opencodeMessages = [
		...(opencodeChatQuery.data ?? []),
		...optimisticOpencodeMessages,
	];

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

	const askOpencodeMutation = api.ticket.askOpencode.useMutation({
		onSuccess: () => {
			void ticketQuery.refetch();
		},
	});

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
		chatMutation.mutate({
			ticketId: ticket.id,
			message: chatInput.trim(),
		});
	};

	const handleSendOpencodeMessage = () => {
		if (!opencodeChatInput.trim() || !ticket?.id) return;
		sendOpencodeMutation.mutate({
			ticketId: ticket.id,
			message: opencodeChatInput.trim(),
		});
	};

	const handleAskOpencode = () => {
		if (!ticket?.id) return;
		askOpencodeMutation.mutate({
			ticketId: ticket.id,
		});
	};

	const handleGenerateRecommendations = () => {
		if (!ticket?.id) return;
		recommendationsMutation.mutate({
			ticketId: ticket.id,
			availableProgrammers: [], // Could be populated from team data
		});
	};

	const latestRecommendation = fullTicket?.recommendations?.[0];
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
							Opencode
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
									disabled={!opencodeAvailable || askOpencodeMutation.isPending}
									onClick={handleAskOpencode}
									size="sm"
									variant="outline"
								>
									{askOpencodeMutation.isPending
										? "Analyzing..."
										: "Ask Opencode"}
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

							{recommendationsMutation.isPending ||
							askOpencodeMutation.isPending ? (
								<div className="space-y-3">
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-4 w-3/4" />
									<Skeleton className="h-4 w-5/6" />
								</div>
							) : latestRecommendation ? (
								<div className="space-y-6">
									{latestRecommendation.recommendedSteps && (
										<div>
											<span className="text-muted-foreground text-xs uppercase tracking-wider">
												Recommended Steps
											</span>
											<div className="prose prose-sm prose-invert mt-3 max-w-none prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-headings:text-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none">
												<Markdown>
													{latestRecommendation.recommendedSteps}
												</Markdown>
											</div>
										</div>
									)}

									{latestRecommendation.recommendedProgrammer && (
										<div>
											<span className="text-muted-foreground text-xs uppercase tracking-wider">
												Recommended Assignee
											</span>
											<p className="mt-2 text-sm">
												{latestRecommendation.recommendedProgrammer}
											</p>
										</div>
									)}

									{latestRecommendation.opencodeSummary && (
										<>
											<div className="h-px bg-border/40" />
											<div>
												<span className="text-muted-foreground text-xs uppercase tracking-wider">
													Opencode Analysis
												</span>
												<div className="prose prose-sm prose-invert mt-3 max-w-none prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-headings:text-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none">
													<Markdown>
														{latestRecommendation.opencodeSummary}
													</Markdown>
												</div>
											</div>
										</>
									)}

									<p className="text-muted-foreground text-xs">
										Generated{" "}
										{new Date(latestRecommendation.createdAt).toLocaleString()}
										{latestRecommendation.modelUsed &&
											` using ${latestRecommendation.modelUsed}`}
									</p>
								</div>
							) : (
								<div className="flex flex-col items-center justify-center py-12 text-center">
									<p className="text-muted-foreground text-sm">
										No recommendations yet
									</p>
									<p className="text-muted-foreground/60 text-xs">
										Click &ldquo;Regenerate&rdquo; to generate AI
										recommendations or &ldquo;Ask Opencode&rdquo; for
										implementation analysis
									</p>
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
													className={`max-w-[80%] overflow-hidden rounded-lg px-4 py-2.5 ${
														msg.role === "user"
															? "bg-foreground text-background"
															: "border border-border/60 bg-card/50"
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
								<div className="flex gap-2">
									<Textarea
										className="min-h-[44px] resize-none text-sm"
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
										Opencode is not available
									</p>
									<p className="text-muted-foreground/60 text-xs">
										Make sure the Opencode server is running and configured
									</p>
								</div>
							) : (
								<>
									{/* Opencode chat messages */}
									<ScrollArea className="min-h-0 flex-1">
										<div className="space-y-3 pr-4">
											{opencodeChatQuery.isLoading ? (
												<div className="space-y-3">
													<Skeleton className="h-12 w-3/4" />
													<Skeleton className="ml-auto h-8 w-1/2" />
													<Skeleton className="h-16 w-4/5" />
												</div>
											) : opencodeMessages.length === 0 ? (
												<div className="flex flex-col items-center justify-center py-12 text-center">
													<p className="text-muted-foreground text-sm">
														No messages yet
													</p>
													<p className="text-muted-foreground/60 text-xs">
														Start a conversation with Opencode about this ticket
													</p>
												</div>
											) : (
												opencodeMessages.map((msg) => (
													<div
														className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
														key={msg.id}
													>
														<div
															className={`max-w-[80%] overflow-hidden rounded-lg px-4 py-2.5 ${
																msg.role === "user"
																	? "bg-foreground text-background"
																	: "border border-border/60 bg-card/50"
															}`}
														>
															<div className="prose prose-sm prose-invert prose-ol:my-1 prose-p:my-1 prose-pre:my-1 prose-ul:my-1 max-w-none overflow-x-auto prose-pre:overflow-x-auto prose-code:rounded prose-code:bg-background/10 prose-code:px-1 prose-code:py-0.5 text-inherit prose-code:before:content-none prose-code:after:content-none">
																<Markdown>{msg.text}</Markdown>
															</div>
															<div className="mt-1 flex items-center gap-2 text-xs tabular-nums opacity-50">
																<span>
																	{new Date(msg.createdAt).toLocaleTimeString()}
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
												))
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
										<div className="flex gap-2">
											<Textarea
												className="min-h-[44px] resize-none text-sm"
												disabled={sendOpencodeMutation.isPending}
												onChange={(e) => setOpencodeChatInput(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter" && !e.shiftKey) {
														e.preventDefault();
														handleSendOpencodeMessage();
													}
												}}
												placeholder="Ask Opencode about this ticket..."
												value={opencodeChatInput}
											/>
											<Button
												className="h-auto px-4"
												disabled={
													!opencodeChatInput.trim() ||
													sendOpencodeMutation.isPending
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
