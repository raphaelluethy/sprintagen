"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

interface TicketModalProps {
	ticket: Ticket | null;
	open: boolean;
	onClose: () => void;
}

const priorityColors: Record<string, string> = {
	urgent: "bg-red-500/10 text-red-600 border-red-200",
	high: "bg-orange-500/10 text-orange-600 border-orange-200",
	medium: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
	low: "bg-green-500/10 text-green-600 border-green-200",
};

const statusColors: Record<string, string> = {
	open: "bg-blue-500/10 text-blue-600 border-blue-200",
	in_progress: "bg-purple-500/10 text-purple-600 border-purple-200",
	review: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
	done: "bg-green-500/10 text-green-600 border-green-200",
	closed: "bg-gray-500/10 text-gray-600 border-gray-200",
};

export function TicketModal({ ticket, open, onClose }: TicketModalProps) {
	const [chatInput, setChatInput] = useState("");
	const [activeTab, setActiveTab] = useState("details");
	const chatEndRef = useRef<HTMLDivElement>(null);

	// Fetch full ticket data with messages
	const ticketQuery = api.ticket.byId.useQuery(
		{ id: ticket?.id ?? "" },
		{ enabled: !!ticket?.id && open },
	);

	const fullTicket = ticketQuery.data ?? ticket;
	const messages = fullTicket?.messages ?? [];

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

	// Scroll to bottom when messages change
	useEffect(() => {
		if (messages.length > 0) {
			chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	});

	const handleSendMessage = () => {
		if (!chatInput.trim() || !ticket?.id) return;
		chatMutation.mutate({
			ticketId: ticket.id,
			message: chatInput.trim(),
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

	if (!ticket) return null;

	return (
		<Dialog onOpenChange={(o) => !o && onClose()} open={open}>
			<DialogContent className="!max-w-[95dvw] flex h-[95dvh] w-[95dvw] flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-start justify-between gap-4">
						<div className="flex-1">
							<div className="font-semibold text-xl">{ticket.title}</div>
							<div className="mt-2 flex items-center gap-2">
								<Badge
									className={statusColors[ticket.status]}
									variant="outline"
								>
									{ticket.status.replace("_", " ")}
								</Badge>
								<Badge
									className={priorityColors[ticket.priority ?? "medium"]}
									variant="outline"
								>
									{ticket.priority}
								</Badge>
								<span className="text-muted-foreground text-sm capitalize">
									via {ticket.provider}
								</span>
								{ticket.externalId && (
									<span className="font-mono text-muted-foreground text-sm">
										#{ticket.externalId}
									</span>
								)}
							</div>
						</div>
						{latestRanking && (
							<div className="text-right">
								<div className="text-muted-foreground text-sm">AI Score</div>
								<div className="font-bold font-mono text-2xl">
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
					<TabsList className="grid w-full grid-cols-3">
						<TabsTrigger value="details">Details</TabsTrigger>
						<TabsTrigger value="recommendations">
							AI Recommendations
						</TabsTrigger>
						<TabsTrigger value="chat">Chat</TabsTrigger>
					</TabsList>

					<TabsContent className="flex-1 overflow-auto" value="details">
						<div className="space-y-4 py-4">
							{/* Metadata */}
							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<span className="text-muted-foreground">Assignee:</span>{" "}
									<span className="font-medium">
										{ticket.assignee ?? "Unassigned"}
									</span>
								</div>
								<div>
									<span className="text-muted-foreground">Created:</span>{" "}
									<span className="font-medium">
										{new Date(ticket.createdAt).toLocaleString()}
									</span>
								</div>
								{ticket.updatedAt && (
									<div>
										<span className="text-muted-foreground">Updated:</span>{" "}
										<span className="font-medium">
											{new Date(ticket.updatedAt).toLocaleString()}
										</span>
									</div>
								)}
								{ticket.lastSyncedAt && (
									<div>
										<span className="text-muted-foreground">Last Synced:</span>{" "}
										<span className="font-medium">
											{new Date(ticket.lastSyncedAt).toLocaleString()}
										</span>
									</div>
								)}
							</div>

							{/* Labels */}
							{ticket.labels && ticket.labels.length > 0 && (
								<div>
									<span className="text-muted-foreground text-sm">Labels:</span>
									<div className="mt-1 flex flex-wrap gap-1">
										{ticket.labels.map((label) => (
											<Badge
												className="text-xs"
												key={label}
												variant="secondary"
											>
												{label}
											</Badge>
										))}
									</div>
								</div>
							)}

							<Separator />

							{/* Description */}
							<div>
								<h4 className="mb-2 font-medium text-sm">Description</h4>
								<div className="prose prose-sm prose-headings:my-2 prose-li:my-0 prose-ol:my-2 prose-p:my-2 prose-pre:my-2 prose-ul:my-2 max-w-none break-words prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-headings:text-foreground text-muted-foreground prose-code:before:content-none prose-code:after:content-none">
									<Markdown>
										{ticket.description || "No description provided."}
									</Markdown>
								</div>
							</div>

							{/* AI Ranking Details */}
							{latestRanking && (
								<>
									<Separator />
									<div>
										<h4 className="mb-2 font-medium text-sm">AI Analysis</h4>
										<div className="grid grid-cols-3 gap-4 text-center">
											<Card>
												<CardContent className="pt-4">
													<div className="font-bold text-2xl">
														{latestRanking.urgencyScore.toFixed(1)}
													</div>
													<div className="text-muted-foreground text-xs">
														Urgency
													</div>
												</CardContent>
											</Card>
											<Card>
												<CardContent className="pt-4">
													<div className="font-bold text-2xl">
														{latestRanking.impactScore.toFixed(1)}
													</div>
													<div className="text-muted-foreground text-xs">
														Impact
													</div>
												</CardContent>
											</Card>
											<Card>
												<CardContent className="pt-4">
													<div className="font-bold text-2xl">
														{latestRanking.complexityScore.toFixed(1)}
													</div>
													<div className="text-muted-foreground text-xs">
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

					<TabsContent className="flex-1 overflow-auto" value="recommendations">
						<div className="space-y-4 py-4">
							<div className="flex justify-end">
								<Button
									disabled={recommendationsMutation.isPending}
									onClick={handleGenerateRecommendations}
									size="sm"
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
							) : latestRecommendation ? (
								<div className="space-y-6">
									<Card>
										<CardHeader>
											<CardTitle className="text-base">
												Recommended Steps
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="prose prose-sm prose-headings:my-2 prose-li:my-0 prose-ol:my-2 prose-p:my-2 prose-pre:my-2 prose-ul:my-2 max-w-none break-words prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none">
												<Markdown>
													{latestRecommendation.recommendedSteps ||
														"No steps generated."}
												</Markdown>
											</div>
										</CardContent>
									</Card>

									{latestRecommendation.recommendedProgrammer && (
										<Card>
											<CardHeader>
												<CardTitle className="text-base">
													Recommended Assignee
												</CardTitle>
											</CardHeader>
											<CardContent>
												<p className="text-sm">
													{latestRecommendation.recommendedProgrammer}
												</p>
											</CardContent>
										</Card>
									)}

									<p className="text-muted-foreground text-xs">
										Generated{" "}
										{new Date(latestRecommendation.createdAt).toLocaleString()}
										{latestRecommendation.modelUsed &&
											` using ${latestRecommendation.modelUsed}`}
									</p>
								</div>
							) : (
								<div className="py-8 text-center text-muted-foreground">
									No recommendations yet. Click &ldquo;Regenerate&rdquo; to
									generate AI recommendations.
								</div>
							)}
						</div>
					</TabsContent>

					<TabsContent
						className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
						value="chat"
					>
						<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden py-4">
							{/* Chat messages */}
							<ScrollArea className="min-h-0 min-w-0 flex-1">
								<div className="space-y-4 pr-4">
									{messages.length === 0 ? (
										<div className="py-8 text-center text-muted-foreground">
											No messages yet. Start a conversation about this ticket.
										</div>
									) : (
										messages.map((msg) => (
											<div
												className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
												key={msg.id}
											>
												<div
													className={`max-w-[80%] overflow-hidden rounded-lg px-4 py-2 ${msg.role === "user"
															? "bg-primary text-primary-foreground"
															: "bg-muted"
														}`}
												>
													<div className="prose prose-sm prose-headings:my-2 prose-li:my-0 prose-ol:my-1 prose-p:my-1 prose-pre:my-1 prose-ul:my-1 max-w-none overflow-x-auto prose-pre:overflow-x-auto break-words prose-code:rounded prose-code:bg-black/10 prose-code:px-1 prose-code:py-0.5 prose-headings:text-inherit text-inherit prose-code:before:content-none prose-code:after:content-none dark:prose-code:bg-white/10">
														<Markdown>{msg.content}</Markdown>
													</div>
													<p className="mt-1 text-xs opacity-60">
														{new Date(msg.createdAt).toLocaleTimeString()}
													</p>
												</div>
											</div>
										))
									)}
									{chatMutation.isPending && (
										<div className="flex justify-start">
											<div className="rounded-lg bg-muted px-4 py-2">
												<div className="flex items-center gap-2">
													<div className="h-2 w-2 animate-bounce rounded-full bg-foreground/40" />
													<div className="h-2 w-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:0.1s]" />
													<div className="h-2 w-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:0.2s]" />
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
										className="min-h-[60px] resize-none"
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
									<div className="flex flex-col gap-2">
										<Button
											className="h-full"
											disabled={!chatInput.trim() || chatMutation.isPending}
											onClick={handleSendMessage}
										>
											Send
										</Button>
									</div>
								</div>
								{messages.length > 0 && (
									<Button
										className="text-muted-foreground text-xs"
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
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
