"use client";
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
import { PRIORITY_STYLES, STATUS_STYLES } from "./constants";

type Ticket = typeof tickets.$inferSelect & {
	recommendations?: (typeof ticketRecommendations.$inferSelect)[];
	rankings?: (typeof ticketRankings.$inferSelect)[];
};

interface TicketTableProps {
	onTicketSelect: (ticket: Ticket) => void;
	viewMode: "standard" | "ai-ranked";
	sortBy: "createdAt" | "priority" | "aiScore";
	sortOrder: "asc" | "desc";
	statusFilter: string;
	onViewModeChange: (view: "standard" | "ai-ranked") => void;
	onSortByChange: (sort: "createdAt" | "priority" | "aiScore") => void;
	onSortOrderChange: (order: "asc" | "desc") => void;
	onStatusFilterChange: (status: string) => void;
	// Tickets with pending Ask Opencode runs
	pendingAskTicketIds: Set<string>;
}

export function TicketTable({
	onTicketSelect,
	viewMode,
	sortBy,
	sortOrder,
	statusFilter,
	onViewModeChange,
	onSortByChange,
	onSortOrderChange,
	onStatusFilterChange,
	pendingAskTicketIds,
}: TicketTableProps) {
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
			ticketsQuery.refetch().catch((error) => {
				console.error("[TicketTable] Failed to refetch tickets:", error);
			});
			aiRankedQuery.refetch().catch((error) => {
				console.error(
					"[TicketTable] Failed to refetch AI ranked tickets:",
					error,
				);
			});
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
			<div className="space-y-2">
				<Skeleton className="h-14 w-full rounded-lg" />
				<Skeleton className="h-14 w-full rounded-lg" />
				<Skeleton className="h-14 w-full rounded-lg" />
				<Skeleton className="h-14 w-full rounded-lg" />
				<Skeleton className="h-14 w-full rounded-lg" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Controls */}
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-xs uppercase tracking-wider">
						View
					</span>
					<Select
						onValueChange={(v) =>
							onViewModeChange(v as "standard" | "ai-ranked")
						}
						value={viewMode}
					>
						<SelectTrigger className="h-8 w-[120px] text-xs">
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
							<span className="text-muted-foreground text-xs uppercase tracking-wider">
								Sort
							</span>
							<Select
								onValueChange={(v) => onSortByChange(v as typeof sortBy)}
								value={sortBy}
							>
								<SelectTrigger className="h-8 w-[100px] text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="createdAt">Date</SelectItem>
									<SelectItem value="priority">Priority</SelectItem>
									<SelectItem value="aiScore">AI Score</SelectItem>
								</SelectContent>
							</Select>
							<Button
								className="h-8 w-8 p-0"
								onClick={() =>
									onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")
								}
								size="sm"
								variant="ghost"
							>
								{sortOrder === "desc" ? "↓" : "↑"}
							</Button>
						</div>

						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-xs uppercase tracking-wider">
								Status
							</span>
							<Select onValueChange={onStatusFilterChange} value={statusFilter}>
								<SelectTrigger className="h-8 w-[110px] text-xs">
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
			<div className="overflow-hidden rounded-lg border border-border/40">
				<Table>
					<TableHeader>
						<TableRow className="border-border/40 hover:bg-transparent">
							<TableHead className="w-[45%] font-normal text-muted-foreground text-xs uppercase tracking-wider">
								Title
							</TableHead>
							<TableHead className="font-normal text-muted-foreground text-xs uppercase tracking-wider">
								Status
							</TableHead>
							<TableHead className="font-normal text-muted-foreground text-xs uppercase tracking-wider">
								Priority
							</TableHead>
							<TableHead className="font-normal text-muted-foreground text-xs uppercase tracking-wider">
								Provider
							</TableHead>
							{viewMode === "ai-ranked" && (
								<TableHead className="font-normal text-muted-foreground text-xs uppercase tracking-wider">
									Score
								</TableHead>
							)}
							<TableHead className="text-right font-normal text-muted-foreground text-xs uppercase tracking-wider">
								Created
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{tickets?.length === 0 ? (
							<TableRow>
								<TableCell
									className="py-12 text-center text-muted-foreground"
									colSpan={viewMode === "ai-ranked" ? 6 : 5}
								>
									No tickets found. Create one or sync from a provider.
								</TableCell>
							</TableRow>
						) : (
							tickets?.map((ticket) => {
								const isPendingAnalysis = pendingAskTicketIds.has(ticket.id);
								return (
									<TableRow
										className="cursor-pointer border-border/40 transition-colors hover:bg-secondary/30"
										key={ticket.id}
										onClick={() => onTicketSelect(ticket)}
									>
										<TableCell className="py-3">
											<div className="flex items-center gap-2">
												{isPendingAnalysis && (
													<svg
														aria-hidden="true"
														className="h-3.5 w-3.5 shrink-0 animate-spin text-foreground"
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
												)}
												<div className="min-w-0">
													<div className="font-medium text-sm">
														{ticket.title}
													</div>
													{ticket.assignee && (
														<div className="mt-0.5 text-muted-foreground text-xs">
															{ticket.assignee}
														</div>
													)}
												</div>
											</div>
										</TableCell>
										<TableCell>
											<Badge
												className={`font-normal text-xs ${STATUS_STYLES[ticket.status]}`}
												variant="secondary"
											>
												{ticket.status.replace("_", " ")}
											</Badge>
										</TableCell>
										<TableCell>
											<Badge
												className={`font-normal text-xs ${PRIORITY_STYLES[ticket.priority ?? "medium"]}`}
												variant="secondary"
											>
												{ticket.priority}
											</Badge>
										</TableCell>
										<TableCell>
											<span className="text-muted-foreground text-xs capitalize">
												{ticket.provider}
											</span>
										</TableCell>
										{viewMode === "ai-ranked" && (
											<TableCell>
												{ticket.aiScore !== null ? (
													<span className="font-mono text-sm tabular-nums">
														{ticket.aiScore.toFixed(1)}
													</span>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</TableCell>
										)}
										<TableCell className="text-right text-muted-foreground text-xs tabular-nums">
											{new Date(ticket.createdAt).toLocaleDateString()}
										</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
