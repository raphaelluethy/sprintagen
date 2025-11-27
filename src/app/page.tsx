"use client";

import Link from "next/link";
import { useState } from "react";
import { CreateTicketDialog } from "@/app/_components/create-ticket-dialog";
import { TicketModal } from "@/app/_components/ticket-modal";
import { TicketTable } from "@/app/_components/ticket-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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

export default function Dashboard() {
	const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
	const [modalOpen, setModalOpen] = useState(false);

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

	const handleTicketSelect = (ticket: Ticket) => {
		setSelectedTicket(ticket);
		setModalOpen(true);
	};

	const handleModalClose = () => {
		setModalOpen(false);
		setSelectedTicket(null);
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
				<TicketTable onTicketSelect={handleTicketSelect} />
			</main>

			{/* Ticket Detail Modal */}
			<TicketModal
				onClose={handleModalClose}
				open={modalOpen}
				ticket={selectedTicket}
			/>
		</div>
	);
}
