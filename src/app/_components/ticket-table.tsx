"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type {
	ticketRankings,
	ticketRecommendations,
	tickets,
} from "@/server/db/schema";
import { api } from "@/trpc/react";

type Ticket = typeof tickets.$inferSelect & {
	recommendations?: (typeof ticketRecommendations.$inferSelect)[];
	rankings?: (typeof ticketRankings.$inferSelect)[];
};

interface TicketTableProps {
	onTicketSelect: (ticket: Ticket) => void;
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

export function TicketTable({ onTicketSelect }: TicketTableProps) {
	const [sortBy, setSortBy] = useState<"createdAt" | "priority" | "aiScore">(
		"createdAt",
	);
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [viewMode, setViewMode] = useState<"standard" | "ai-ranked">(
		"standard",
	);

	const ticketsQuery = api.ticket.list.useQuery(
		viewMode === "ai-ranked"
			? undefined
			: {
					sortBy,
					sortOrder,
					status:
						statusFilter !== "all"
							? (statusFilter as
									| "open"
									| "in_progress"
									| "review"
									| "done"
									| "closed")
							: undefined,
				},
		{ refetchInterval: 30000 },
	);

	const aiRankedQuery = api.ticket.listByAIRank.useQuery(
		{ limit: 50 },
		{ enabled: viewMode === "ai-ranked" },
	);

	const rankMutation = api.ticket.rankTickets.useMutation({
		onSuccess: () => {
			void ticketsQuery.refetch();
			void aiRankedQuery.refetch();
		},
	});

	const tickets =
		viewMode === "ai-ranked" ? aiRankedQuery.data : ticketsQuery.data;
	const isLoading =
		viewMode === "ai-ranked" ? aiRankedQuery.isLoading : ticketsQuery.isLoading;

	const handleRankAll = () => {
		if (!ticketsQuery.data?.length) return;
		const ids = ticketsQuery.data.slice(0, 20).map((t) => t.id);
		rankMutation.mutate({ ticketIds: ids });
	};

	if (isLoading) {
		return (
			<div className="space-y-3">
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Controls */}
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-sm">View:</span>
					<Select
						onValueChange={(v) => setViewMode(v as "standard" | "ai-ranked")}
						value={viewMode}
					>
						<SelectTrigger className="w-[140px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="standard">Standard</SelectItem>
							<SelectItem value="ai-ranked">AI Ranked</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{viewMode === "standard" && (
					<>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-sm">Sort:</span>
							<Select
								onValueChange={(v) => setSortBy(v as typeof sortBy)}
								value={sortBy}
							>
								<SelectTrigger className="w-[120px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="createdAt">Date</SelectItem>
									<SelectItem value="priority">Priority</SelectItem>
									<SelectItem value="aiScore">AI Score</SelectItem>
								</SelectContent>
							</Select>
							<Button
								onClick={() =>
									setSortOrder((o) => (o === "asc" ? "desc" : "asc"))
								}
								size="sm"
								variant="ghost"
							>
								{sortOrder === "desc" ? "↓" : "↑"}
							</Button>
						</div>

						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-sm">Status:</span>
							<Select onValueChange={setStatusFilter} value={statusFilter}>
								<SelectTrigger className="w-[130px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All</SelectItem>
									<SelectItem value="open">Open</SelectItem>
									<SelectItem value="in_progress">In Progress</SelectItem>
									<SelectItem value="review">Review</SelectItem>
									<SelectItem value="done">Done</SelectItem>
									<SelectItem value="closed">Closed</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</>
				)}

				<div className="ml-auto">
					<Button
						disabled={rankMutation.isPending || !ticketsQuery.data?.length}
						onClick={handleRankAll}
						size="sm"
						variant="outline"
					>
						{rankMutation.isPending ? "Ranking..." : "AI Rank All"}
					</Button>
				</div>
			</div>

			{/* Table */}
			<div className="rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[40%]">Title</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Priority</TableHead>
							<TableHead>Provider</TableHead>
							{viewMode === "ai-ranked" && <TableHead>AI Score</TableHead>}
							<TableHead className="text-right">Created</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{tickets?.length === 0 ? (
							<TableRow>
								<TableCell
									className="py-8 text-center text-muted-foreground"
									colSpan={viewMode === "ai-ranked" ? 6 : 5}
								>
									No tickets found. Create one or sync from a provider.
								</TableCell>
							</TableRow>
						) : (
							tickets?.map((ticket) => (
								<TableRow
									className="cursor-pointer transition-colors hover:bg-muted/50"
									key={ticket.id}
									onClick={() => onTicketSelect(ticket)}
								>
									<TableCell>
										<div className="font-medium">{ticket.title}</div>
										{ticket.assignee && (
											<div className="text-muted-foreground text-sm">
												{ticket.assignee}
											</div>
										)}
									</TableCell>
									<TableCell>
										<Badge
											className={statusColors[ticket.status]}
											variant="outline"
										>
											{ticket.status.replace("_", " ")}
										</Badge>
									</TableCell>
									<TableCell>
										<Badge
											className={priorityColors[ticket.priority ?? "medium"]}
											variant="outline"
										>
											{ticket.priority}
										</Badge>
									</TableCell>
									<TableCell>
										<span className="text-muted-foreground text-sm capitalize">
											{ticket.provider}
										</span>
									</TableCell>
									{viewMode === "ai-ranked" && (
										<TableCell>
											{ticket.aiScore !== null ? (
												<Badge className="font-mono" variant="secondary">
													{ticket.aiScore.toFixed(1)}
												</Badge>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
									)}
									<TableCell className="text-right text-muted-foreground text-sm">
										{new Date(ticket.createdAt).toLocaleDateString()}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

