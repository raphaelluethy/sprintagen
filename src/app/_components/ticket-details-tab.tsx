"use client";

import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

export function TicketDetailsTab({
	ticket,
	latestRanking,
}: TicketDetailsTabProps) {
	return (
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
	);
}
