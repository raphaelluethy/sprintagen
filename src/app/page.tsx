"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CreateTicketDialog } from "@/app/_components/create-ticket-dialog";
import { TicketModal } from "@/app/_components/ticket-modal";
import { TicketTable } from "@/app/_components/ticket-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useActiveSessions } from "@/hooks/useActiveSessions";
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

function DashboardContent() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	// URL helper function
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

	// Derive ticketId from URL
	const ticketIdParam = searchParams.get("ticketId");

	// Derive view/sort/filter state from URL with defaults
	const viewMode =
		(searchParams.get("view") as "standard" | "ai-ranked") || "standard";
	const sortBy =
		(searchParams.get("sortBy") as "createdAt" | "priority" | "aiScore") ||
		"createdAt";
	const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "desc";
	const statusFilter = searchParams.get("status") || "all";

	// Validate and sanitize URL params
	const validViewMode = viewMode === "ai-ranked" ? "ai-ranked" : "standard";
	const validSortBy = ["createdAt", "priority", "aiScore"].includes(sortBy)
		? sortBy
		: "createdAt";
	const validSortOrder = sortOrder === "asc" ? "asc" : "desc";
	const validStatusFilter = [
		"all",
		"open",
		"in_progress",
		"review",
		"done",
		"closed",
	].includes(statusFilter)
		? statusFilter
		: "all";

	// Local state for selected ticket (for instant UI updates)
	const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

	// Track the ticket ID currently being processed by the askOpencode mutation
	// This provides immediate UI feedback before the hook state updates
	const [mutatingTicketId, setMutatingTicketId] = useState<string | null>(null);

	// Active sessions hook - restores pending sessions on page load
	const {
		pendingAskTicketIds,
		isAskOpencodePending: isAskOpencodePendingFromHook,
		getPendingSessionId,
		markTicketPending,
		setSessionId,
		clearTicketPending,
		refetch: refetchPendingSessions,
	} = useActiveSessions();

	// Combined check: either the hook says it's pending OR we're currently mutating
	const isAskOpencodePending = useCallback(
		(ticketId: string) =>
			isAskOpencodePendingFromHook(ticketId) || mutatingTicketId === ticketId,
		[isAskOpencodePendingFromHook, mutatingTicketId],
	);

	// Combined set for the table: includes both hook state and current mutation
	const combinedPendingAskTicketIds = useMemo(() => {
		if (!mutatingTicketId) return pendingAskTicketIds;
		const combined = new Set(pendingAskTicketIds);
		combined.add(mutatingTicketId);
		return combined;
	}, [pendingAskTicketIds, mutatingTicketId]);

	// Derive modal open state from URL
	const isModalOpen = !!ticketIdParam;

	// Query for deep-linking: fetch ticket by ID when ticketIdParam is present
	const deepLinkedTicketQuery = api.ticket.byId.useQuery(
		{ id: ticketIdParam ?? "" },
		{ enabled: !!ticketIdParam && !selectedTicket },
	);

	// Use deep-linked ticket if no locally selected ticket
	const modalTicket = selectedTicket ?? deepLinkedTicketQuery.data ?? null;

	// Sync selectedTicket when URL changes externally (e.g., browser back/forward)
	useEffect(() => {
		if (!ticketIdParam) {
			setSelectedTicket(null);
		}
	}, [ticketIdParam]);

	const utils = api.useUtils();

	// Queries for status indicators
	const providerStatus = api.ticket.getProviderStatus.useQuery();
	const aiStatus = api.ticket.getAIStatus.useQuery();
	const ticketsQuery = api.ticket.list.useQuery();

	// Mutations
	const syncMutation = api.ticket.syncAll.useMutation({
		onSuccess: () => {
			void utils.ticket.list.invalidate();
		},
	});

	// Ask Opencode mutation - lifted to Dashboard level so it persists when modal closes
	const askOpencodeMutation = api.ticket.askOpencode.useMutation({
		onMutate: (variables) => {
			// Immediately show loading state via local state (instant feedback)
			setMutatingTicketId(variables.ticketId);
			// Also mark in the hook for persistence
			markTicketPending(variables.ticketId);
		},
		onSuccess: (data, variables) => {
			// Store the sessionId for SSE connection when available
			if (data?.sessionId) {
				setSessionId(variables.ticketId, data.sessionId);
				toast.success("Opencode session created", {
					description: "Analysis has started.",
				});
			}
		},
		onSettled: (_data, _error, variables) => {
			// Clear the local mutating state (the hook state persists)
			setMutatingTicketId(null);
			// Invalidate ticket data to refresh recommendations
			void utils.ticket.byId.invalidate({ id: variables.ticketId });
			void utils.ticket.list.invalidate();
			// Also refetch pending inquiries to get updated state
			void refetchPendingSessions();
		},
	});

	// Handler for Ask Opencode - callable from TicketModal
	const handleAskOpencode = useCallback(
		(ticketId: string) => {
			askOpencodeMutation.mutate({ ticketId });
		},
		[askOpencodeMutation],
	);

	const handleTicketSelect = (ticket: Ticket) => {
		setSelectedTicket(ticket);
		updateSearchParams({ ticketId: ticket.id });
	};

	const handleModalClose = () => {
		setSelectedTicket(null);
		updateSearchParams({ ticketId: null });
	};

	// Handlers for view/sort/filter changes
	const handleViewModeChange = (view: "standard" | "ai-ranked") => {
		updateSearchParams({ view });
	};

	const handleSortByChange = (sort: "createdAt" | "priority" | "aiScore") => {
		updateSearchParams({ sortBy: sort });
	};

	const handleSortOrderChange = (order: "asc" | "desc") => {
		updateSearchParams({ sortOrder: order });
	};

	const handleStatusFilterChange = (status: string) => {
		updateSearchParams({ status: status === "all" ? null : status });
	};

	// Count tickets by status
	const ticketCounts = ticketsQuery.data?.reduce<{
		total: number;
		[key: string]: number;
	}>(
		(acc, t) => {
			acc[t.status] = (acc[t.status] ?? 0) + 1;
			acc.total = acc.total + 1;
			return acc;
		},
		{ total: 0 },
	) ?? { total: 0 };

	return (
		<div className="min-h-screen">
			{/* Header */}
			<header className="sticky top-0 z-50 border-border/40 border-b bg-background/80 backdrop-blur-sm">
				<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
					<div className="flex items-center gap-8">
						<div className="flex items-center gap-3">
							<div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground">
								<span className="font-bold text-background text-sm">S</span>
							</div>
							<span className="font-semibold text-lg tracking-tight">
								Sprintagen
							</span>
						</div>
						{/* Navigation */}
						<nav className="hidden items-center gap-1 md:flex">
							<Link
								className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-secondary hover:text-foreground"
								href="/admin/chats"
							>
								Chat
							</Link>
							<a
								className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-secondary hover:text-foreground"
								href="http://localhost:4096"
								rel="noopener noreferrer"
								target="_blank"
							>
								Opencode
							</a>
						</nav>
					</div>
					<div className="flex items-center gap-3">
						<ThemeToggle />
						<Button
							disabled={syncMutation.isPending}
							onClick={() => syncMutation.mutate()}
							size="sm"
							variant="outline"
						>
							{syncMutation.isPending ? "Syncing..." : "Sync"}
						</Button>
						<CreateTicketDialog />
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-7xl px-6 py-8">
				{/* Stats Grid */}
				<div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
					<Card className="border-border/40 bg-card/50">
						<CardContent className="p-4">
							<p className="text-muted-foreground text-xs uppercase tracking-wider">
								Total
							</p>
							<p className="mt-1 font-light font-mono text-3xl tabular-nums">
								{ticketCounts.total}
							</p>
						</CardContent>
					</Card>
					<Card className="border-border/40 bg-card/50">
						<CardContent className="p-4">
							<p className="text-muted-foreground text-xs uppercase tracking-wider">
								Open
							</p>
							<p className="mt-1 font-light font-mono text-3xl tabular-nums">
								{ticketCounts.open ?? 0}
							</p>
						</CardContent>
					</Card>
					<Card className="border-border/40 bg-card/50">
						<CardContent className="p-4">
							<p className="text-muted-foreground text-xs uppercase tracking-wider">
								In Progress
							</p>
							<p className="mt-1 font-light font-mono text-3xl tabular-nums">
								{ticketCounts.in_progress ?? 0}
							</p>
						</CardContent>
					</Card>
					<Card className="border-border/40 bg-card/50">
						<CardContent className="p-4">
							<p className="text-muted-foreground text-xs uppercase tracking-wider">
								Done
							</p>
							<p className="mt-1 font-light font-mono text-3xl tabular-nums">
								{ticketCounts.done ?? 0}
							</p>
						</CardContent>
					</Card>
				</div>

				{/* Integration Status */}
				<div className="mb-8 flex flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-4 py-3">
					<span className="text-muted-foreground text-xs uppercase tracking-wider">
						Integrations
					</span>
					<div className="flex flex-wrap gap-1.5">
						{providerStatus.data?.map((provider) => (
							<Badge
								className="font-normal capitalize"
								key={provider.name}
								variant={provider.configured ? "default" : "outline"}
							>
								{provider.name}
							</Badge>
						))}
					</div>
					<div className="mx-2 h-4 w-px bg-border" />
					<span className="text-muted-foreground text-xs uppercase tracking-wider">
						AI
					</span>
					<div className="flex gap-1.5">
						<Badge
							className="font-normal"
							variant={
								aiStatus.data?.openRouterConfigured ? "default" : "outline"
							}
						>
							Chat
						</Badge>
						<Badge
							className="font-normal"
							variant={
								aiStatus.data?.cerebrasConfigured ? "default" : "outline"
							}
						>
							Ranking
						</Badge>
					</div>
				</div>

				{/* Sync Results */}
				{syncMutation.data && (
					<div className="mb-6 rounded-lg border border-border/40 bg-card/30 px-4 py-3">
						<p className="text-muted-foreground text-sm">
							Sync complete:{" "}
							<span className="text-foreground">
								{syncMutation.data.totalCreated} created
							</span>
							,{" "}
							<span className="text-foreground">
								{syncMutation.data.totalUpdated} updated
							</span>
							{syncMutation.data.totalErrors > 0 && (
								<span className="text-destructive">
									{" "}
									({syncMutation.data.totalErrors} errors)
								</span>
							)}
						</p>
					</div>
				)}

				{/* Ticket Table */}
				<TicketTable
					onSortByChange={handleSortByChange}
					onSortOrderChange={handleSortOrderChange}
					onStatusFilterChange={handleStatusFilterChange}
					onTicketSelect={handleTicketSelect}
					onViewModeChange={handleViewModeChange}
					pendingAskTicketIds={combinedPendingAskTicketIds}
					sortBy={validSortBy}
					sortOrder={validSortOrder}
					statusFilter={validStatusFilter}
					viewMode={validViewMode}
				/>
			</main>

			{/* Ticket Detail Modal */}
			<TicketModal
				getPendingSessionId={getPendingSessionId}
				isAskOpencodePending={isAskOpencodePending}
				onAskOpencode={handleAskOpencode}
				onAskOpencodeComplete={clearTicketPending}
				onClose={handleModalClose}
				open={isModalOpen}
				ticket={modalTicket}
			/>
		</div>
	);
}

export default function Dashboard() {
	return (
		<Suspense fallback={<div className="min-h-screen">Loading...</div>}>
			<DashboardContent />
		</Suspense>
	);
}
