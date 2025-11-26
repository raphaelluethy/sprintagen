<<<<<<< Current (Your changes)
"use client";

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
						<div>
							<h1 className="font-bold text-2xl tracking-tight">Sprintagen</h1>
							<p className="text-muted-foreground text-sm">
								AI-powered ticket management
							</p>
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
=======
import Link from "next/link";

export default function Home() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0f]">
			{/* Background gradient */}
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent" />

			<div className="relative z-10 flex flex-col items-center gap-8 px-4">
				{/* Logo/Title */}
				<div className="flex flex-col items-center gap-4">
					<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/25 shadow-lg">
						<svg
							aria-hidden="true"
							className="h-8 w-8 text-white"
							fill="none"
							stroke="currentColor"
							strokeWidth={1.5}
							viewBox="0 0 24 24"
						>
							<path
								d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</div>
					<h1 className="bg-gradient-to-r from-white to-[#a1a1aa] bg-clip-text font-bold text-4xl text-transparent tracking-tight">
						Sprintagen
					</h1>
					<p className="max-w-md text-center text-[#71717a]">
						AI-powered development assistant with integrated Opencode chat
					</p>
				</div>

				{/* Navigation Cards */}
				<div className="mt-4 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
					<Link
						className="group flex flex-col gap-3 rounded-xl border border-[#27272a] bg-[#0f0f14]/80 p-6 transition-all hover:border-emerald-500/50 hover:bg-[#0f0f14]"
						href="/admin/chats"
					>
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
							<svg
								aria-hidden="true"
								className="h-5 w-5"
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
						</div>
						<div>
							<h2 className="font-semibold text-[#e4e4e7] text-lg">
								Opencode Chat
							</h2>
							<p className="mt-1 text-[#71717a] text-sm">
								Chat with AI to analyze and work on your codebase
							</p>
						</div>
						<span className="mt-auto flex items-center gap-1 text-emerald-400 text-sm">
							Open chat
							<svg
								aria-hidden="true"
								className="h-4 w-4 transition-transform group-hover:translate-x-1"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
								/>
							</svg>
						</span>
					</Link>

					<a
						className="group flex flex-col gap-3 rounded-xl border border-[#27272a] bg-[#0f0f14]/80 p-6 transition-all hover:border-teal-500/50 hover:bg-[#0f0f14]"
						href="http://localhost:4096"
						rel="noopener noreferrer"
						target="_blank"
					>
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 transition-colors group-hover:bg-teal-500/20">
							<svg
								aria-hidden="true"
								className="h-5 w-5"
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
						</div>
						<div>
							<h2 className="font-semibold text-[#e4e4e7] text-lg">
								Opencode UI
							</h2>
							<p className="mt-1 text-[#71717a] text-sm">
								Access the native Opencode interface directly
							</p>
						</div>
						<span className="mt-auto flex items-center gap-1 text-sm text-teal-400">
							Open in new tab
							<svg
								aria-hidden="true"
								className="h-4 w-4 transition-transform group-hover:translate-x-1"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
								/>
							</svg>
						</span>
					</a>
				</div>

				{/* Footer info */}
				<p className="mt-8 text-[#52525b] text-xs">
					Make sure Docker containers are running:{" "}
					<code className="rounded bg-[#1c1c22] px-1.5 py-0.5 text-[#71717a]">
						docker compose up
					</code>
				</p>
			</div>
		</main>
>>>>>>> Incoming (Background Agent changes)
	);
}
