"use client";

import Link from "next/link";
import { useState } from "react";
import { CreateTicketDialog } from "@/app/_components/create-ticket-dialog";
import { TicketModal } from "@/app/_components/ticket-modal";
import { TicketTable } from "@/app/_components/ticket-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
		<div className="min-h-screen bg-background">
			{/* Header */}
			<header className="border-b bg-card">
				<div className="container mx-auto px-4 py-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-6">
							<div>
								<h1 className="font-bold text-2xl tracking-tight">
									Sprintagen
								</h1>
								<p className="text-muted-foreground text-sm">
									AI-powered ticket management
								</p>
							</div>
							{/* Opencode Navigation */}
							<div className="flex items-center gap-2">
								<Link
									className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10"
									href="/admin/chats"
								>
									<svg
										aria-hidden="true"
										className="h-4 w-4 text-emerald-500"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
										/>
									</svg>
									Opencode Chat
								</Link>
								<a
									className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:border-teal-500/50 hover:bg-teal-500/10"
									href="http://localhost:4096"
									rel="noopener noreferrer"
									target="_blank"
								>
									<svg
										aria-hidden="true"
										className="h-4 w-4 text-teal-500"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
										/>
									</svg>
									Opencode UI
								</a>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<Button
								disabled={syncMutation.isPending}
								onClick={() => syncMutation.mutate()}
								variant="outline"
							>
								{syncMutation.isPending ? "Syncing..." : "Sync Tickets"}
							</Button>
							<CreateTicketDialog />
						</div>
					</div>
				</div>
			</header>

			<main className="container mx-auto px-4 py-6">
				{/* Status Cards */}
				<div className="mb-6 grid gap-4 md:grid-cols-4">
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="font-medium text-muted-foreground text-sm">
								Total Tickets
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="font-bold text-3xl">{ticketCounts.total}</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="font-medium text-muted-foreground text-sm">
								Open
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="font-bold text-3xl text-blue-600">
								{ticketCounts.open ?? 0}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="font-medium text-muted-foreground text-sm">
								In Progress
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="font-bold text-3xl text-purple-600">
								{ticketCounts.in_progress ?? 0}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="font-medium text-muted-foreground text-sm">
								Done
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="font-bold text-3xl text-green-600">
								{ticketCounts.done ?? 0}
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Integration Status */}
				<div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg bg-muted/50 p-4">
					<span className="font-medium text-sm">Integrations:</span>
					<div className="flex flex-wrap gap-2">
						{providerStatus.data?.map((provider) => (
							<Badge
								className="capitalize"
								key={provider.name}
								variant={provider.configured ? "default" : "secondary"}
							>
								{provider.name} {provider.configured ? "✓" : "○"}
							</Badge>
						))}
					</div>
					<Separator className="h-4" orientation="vertical" />
					<span className="font-medium text-sm">AI:</span>
					<div className="flex gap-2">
						<Badge
							variant={
								aiStatus.data?.openRouterConfigured ? "default" : "secondary"
							}
						>
							Chat {aiStatus.data?.openRouterConfigured ? "✓" : "○"}
						</Badge>
						<Badge
							variant={
								aiStatus.data?.cerebrasConfigured ? "default" : "secondary"
							}
						>
							Ranking {aiStatus.data?.cerebrasConfigured ? "✓" : "○"}
						</Badge>
					</div>
				</div>

				{/* Sync Results */}
				{syncMutation.data && (
					<div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
						<p className="text-green-800 text-sm dark:text-green-200">
							Sync complete: {syncMutation.data.totalCreated} created,{" "}
							{syncMutation.data.totalUpdated} updated
							{syncMutation.data.totalErrors > 0 && (
								<span className="text-orange-600 dark:text-orange-400">
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
