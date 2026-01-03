"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/trpc/react";
import type { TicketWithRelations } from "@/types";
import { ControlBar } from "./control-bar";
import { TicketRow } from "./table-row";

type Ticket = TicketWithRelations;

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
			<ControlBar
				hasTickets={!!ticketsQuery.data?.length}
				isRanking={rankMutation.isPending}
				onRankAll={handleRankAll}
				onSortByChange={onSortByChange}
				onSortOrderChange={onSortOrderChange}
				onStatusFilterChange={onStatusFilterChange}
				onViewModeChange={onViewModeChange}
				sortBy={sortBy}
				sortOrder={sortOrder}
				statusFilter={statusFilter}
				viewMode={viewMode}
			/>

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
							tickets?.map((ticket) => (
								<TicketRow
									isPendingAnalysis={pendingAskTicketIds.has(ticket.id)}
									key={ticket.id}
									onSelect={() => onTicketSelect(ticket)}
									showAiScore={viewMode === "ai-ranked"}
									ticket={ticket}
								/>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
