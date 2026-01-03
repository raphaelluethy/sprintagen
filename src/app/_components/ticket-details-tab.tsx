"use client";

import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TabsContent } from "@/components/ui/tabs";
import type {
	ticketMessages,
	ticketRankings,
	ticketRecommendations,
	tickets,
} from "@/server/db/schema";

type Ticket = typeof tickets.$inferSelect & {
	recommendations?: (typeof ticketRecommendations.$inferSelect)[];
	rankings?: (typeof ticketRankings.$inferSelect)[];
	messages?: (typeof ticketMessages.$inferSelect)[];
};

interface TicketDetailsTabProps {
	ticket: Ticket;
	latestRanking?: typeof ticketRankings.$inferSelect | null;
}

// Helper to get score color
function getScoreColor(
	score: number,
	type: "urgency" | "impact" | "complexity",
) {
	if (type === "complexity") {
		// Lower complexity is better
		if (score >= 7) return "text-red-400";
		if (score >= 4) return "text-amber-400";
		return "text-emerald-400";
	}
	// Higher urgency/impact means more important
	if (score >= 7) return "text-red-400";
	if (score >= 5) return "text-amber-400";
	return "text-slate-400";
}

export function TicketDetailsTab({
	ticket,
	latestRanking,
}: TicketDetailsTabProps) {
	return (
		<TabsContent
			className="mt-0 min-h-0 flex-1 overflow-hidden"
			value="details"
		>
			<ScrollArea className="h-full">
				<div className="space-y-6 px-6 py-5">
					{/* Metadata grid with icons */}
					<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
						{/* Assignee */}
						<div className="rounded-lg border border-border/30 bg-card/30 p-3">
							<div className="flex items-center gap-2 text-muted-foreground">
								<svg
									aria-hidden="true"
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
								<span className="font-medium text-[10px] uppercase tracking-wider">
									Assignee
								</span>
							</div>
							<p className="mt-1.5 truncate font-medium text-sm">
								{ticket.assignee ?? (
									<span className="text-muted-foreground">Unassigned</span>
								)}
							</p>
						</div>

						{/* Created */}
						<div className="rounded-lg border border-border/30 bg-card/30 p-3">
							<div className="flex items-center gap-2 text-muted-foreground">
								<svg
									aria-hidden="true"
									className="h-3.5 w-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
									/>
								</svg>
								<span className="font-medium text-[10px] uppercase tracking-wider">
									Created
								</span>
							</div>
							<p className="mt-1.5 font-medium text-sm tabular-nums">
								{new Date(ticket.createdAt).toLocaleDateString(undefined, {
									month: "short",
									day: "numeric",
									year: "numeric",
								})}
							</p>
						</div>

						{/* Updated */}
						{ticket.updatedAt && (
							<div className="rounded-lg border border-border/30 bg-card/30 p-3">
								<div className="flex items-center gap-2 text-muted-foreground">
									<svg
										aria-hidden="true"
										className="h-3.5 w-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
										/>
									</svg>
									<span className="font-medium text-[10px] uppercase tracking-wider">
										Updated
									</span>
								</div>
								<p className="mt-1.5 font-medium text-sm tabular-nums">
									{new Date(ticket.updatedAt).toLocaleDateString(undefined, {
										month: "short",
										day: "numeric",
										year: "numeric",
									})}
								</p>
							</div>
						)}

						{/* Last Synced */}
						{ticket.lastSyncedAt && (
							<div className="rounded-lg border border-border/30 bg-card/30 p-3">
								<div className="flex items-center gap-2 text-muted-foreground">
									<svg
										aria-hidden="true"
										className="h-3.5 w-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
										/>
									</svg>
									<span className="font-medium text-[10px] uppercase tracking-wider">
										Synced
									</span>
								</div>
								<p className="mt-1.5 font-medium text-sm tabular-nums">
									{new Date(ticket.lastSyncedAt).toLocaleDateString(undefined, {
										month: "short",
										day: "numeric",
										year: "numeric",
									})}
								</p>
							</div>
						)}
					</div>

					{/* Labels */}
					{ticket.labels && ticket.labels.length > 0 && (
						<div className="space-y-2">
							<div className="flex items-center gap-2 text-muted-foreground">
								<svg
									aria-hidden="true"
									className="h-3.5 w-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
									/>
								</svg>
								<span className="font-medium text-[10px] uppercase tracking-wider">
									Labels
								</span>
							</div>
							<div className="flex flex-wrap gap-1.5">
								{ticket.labels.map((label) => (
									<Badge
										className="border-violet-500/30 bg-violet-500/10 text-violet-400 text-xs"
										key={label}
										variant="outline"
									>
										{label}
									</Badge>
								))}
							</div>
						</div>
					)}

					{/* Divider */}
					<div className="flex items-center gap-3">
						<div className="h-px flex-1 bg-border/30" />
						<span className="font-medium text-[10px] text-muted-foreground/50 uppercase tracking-wider">
							Description
						</span>
						<div className="h-px flex-1 bg-border/30" />
					</div>

					{/* Description with improved styling */}
					<div className="rounded-lg border border-border/30 bg-card/20 p-5">
						{ticket.description ? (
							<div className="prose prose-sm prose-invert max-w-none prose-code:rounded prose-pre:rounded-lg prose-pre:border prose-blockquote:border-primary/30 prose-pre:border-border/30 prose-code:bg-muted prose-pre:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal prose-headings:font-semibold prose-a:text-primary prose-blockquote:text-muted-foreground prose-code:text-foreground prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-headings:text-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-p:leading-relaxed prose-a:no-underline prose-li:marker:text-muted-foreground/50 prose-code:before:content-none prose-code:after:content-none hover:prose-a:underline">
								<Markdown rehypePlugins={[rehypeSanitize]}>
									{ticket.description}
								</Markdown>
							</div>
						) : (
							<div className="flex flex-col items-center justify-center py-8 text-center">
								<svg
									aria-hidden="true"
									className="h-8 w-8 text-muted-foreground/30"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
									/>
								</svg>
								<p className="mt-2 text-muted-foreground text-sm">
									No description provided
								</p>
							</div>
						)}
					</div>

					{/* AI Analysis section */}
					{latestRanking && (
						<>
							{/* Divider */}
							<div className="flex items-center gap-3">
								<div className="h-px flex-1 bg-border/30" />
								<span className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground/50 uppercase tracking-wider">
									<svg
										aria-hidden="true"
										className="h-3 w-3"
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
									AI Analysis
								</span>
								<div className="h-px flex-1 bg-border/30" />
							</div>

							{/* Score cards with visual indicators */}
							<div className="grid grid-cols-3 gap-3">
								{/* Urgency */}
								<Card className="group relative overflow-hidden border-border/30 bg-card/30 transition-colors hover:bg-card/50">
									<div
										className={`absolute inset-x-0 top-0 h-1 ${
											latestRanking.urgencyScore >= 7
												? "bg-red-400"
												: latestRanking.urgencyScore >= 5
													? "bg-amber-400"
													: "bg-slate-400"
										}`}
									/>
									<CardContent className="p-4 pt-5 text-center">
										<div
											className={`font-mono font-semibold text-3xl tabular-nums ${getScoreColor(latestRanking.urgencyScore, "urgency")}`}
										>
											{latestRanking.urgencyScore.toFixed(1)}
										</div>
										<div className="mt-1.5 flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
											<svg
												aria-hidden="true"
												className="h-3.5 w-3.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
												/>
											</svg>
											<span className="font-medium uppercase tracking-wider">
												Urgency
											</span>
										</div>
									</CardContent>
								</Card>

								{/* Impact */}
								<Card className="group relative overflow-hidden border-border/30 bg-card/30 transition-colors hover:bg-card/50">
									<div
										className={`absolute inset-x-0 top-0 h-1 ${
											latestRanking.impactScore >= 7
												? "bg-red-400"
												: latestRanking.impactScore >= 5
													? "bg-amber-400"
													: "bg-slate-400"
										}`}
									/>
									<CardContent className="p-4 pt-5 text-center">
										<div
											className={`font-mono font-semibold text-3xl tabular-nums ${getScoreColor(latestRanking.impactScore, "impact")}`}
										>
											{latestRanking.impactScore.toFixed(1)}
										</div>
										<div className="mt-1.5 flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
											<svg
												aria-hidden="true"
												className="h-3.5 w-3.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													d="M13 10V3L4 14h7v7l9-11h-7z"
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
												/>
											</svg>
											<span className="font-medium uppercase tracking-wider">
												Impact
											</span>
										</div>
									</CardContent>
								</Card>

								{/* Complexity */}
								<Card className="group relative overflow-hidden border-border/30 bg-card/30 transition-colors hover:bg-card/50">
									<div
										className={`absolute inset-x-0 top-0 h-1 ${
											latestRanking.complexityScore >= 7
												? "bg-red-400"
												: latestRanking.complexityScore >= 4
													? "bg-amber-400"
													: "bg-emerald-400"
										}`}
									/>
									<CardContent className="p-4 pt-5 text-center">
										<div
											className={`font-mono font-semibold text-3xl tabular-nums ${getScoreColor(latestRanking.complexityScore, "complexity")}`}
										>
											{latestRanking.complexityScore.toFixed(1)}
										</div>
										<div className="mt-1.5 flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
											<svg
												aria-hidden="true"
												className="h-3.5 w-3.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
												/>
											</svg>
											<span className="font-medium uppercase tracking-wider">
												Complexity
											</span>
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Reasoning */}
							{latestRanking.reasoning && (
								<div className="rounded-lg border border-border/30 bg-muted/20 p-4">
									<div className="flex items-start gap-2">
										<svg
											aria-hidden="true"
											className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
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
										<p className="text-muted-foreground text-sm leading-relaxed">
											{latestRanking.reasoning}
										</p>
									</div>
								</div>
							)}
						</>
					)}
				</div>
			</ScrollArea>
		</TabsContent>
	);
}
