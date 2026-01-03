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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
	ticketRankings,
	ticketRecommendations,
	tickets,
} from "@/server/db/schema";
import { api } from "@/trpc/react";
import {
	PRIORITY_ICONS,
	PRIORITY_STYLES,
	PROVIDER_STYLES,
	STATUS_STYLES,
} from "./constants";

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
			<div className="space-y-4">
				{/* Controls skeleton */}
				<div className="flex items-center gap-3">
					<Skeleton className="h-8 w-32 rounded-md" />
					<Skeleton className="h-8 w-28 rounded-md" />
					<Skeleton className="h-8 w-28 rounded-md" />
					<div className="ml-auto">
						<Skeleton className="h-8 w-24 rounded-md" />
					</div>
				</div>
				{/* Table skeleton with animated rows */}
				<div className="overflow-hidden rounded-xl border border-border/50 bg-card/30">
					<div className="border-border/30 border-b bg-muted/30 px-4 py-3">
						<div className="flex gap-8">
							<Skeleton className="h-4 w-16" />
							<Skeleton className="h-4 w-14" />
							<Skeleton className="h-4 w-14" />
							<Skeleton className="h-4 w-16" />
						</div>
					</div>
					{[...Array(5)].map((_, i) => (
						<div
							className="flex items-center gap-4 border-border/20 border-b px-4 py-4 last:border-b-0"
							key={i}
							style={{ animationDelay: `${i * 100}ms` }}
						>
							<div className="flex-1 space-y-2">
								<Skeleton className="h-4 w-3/4" />
								<Skeleton className="h-3 w-1/4" />
							</div>
							<Skeleton className="h-6 w-20 rounded-full" />
							<Skeleton className="h-6 w-16 rounded-full" />
							<Skeleton className="h-4 w-14" />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<TooltipProvider delayDuration={200}>
			<div className="space-y-4">
				{/* Controls bar with improved styling */}
				<div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/30 bg-muted/20 p-2">
					{/* View mode toggle */}
					<div className="flex items-center gap-2 rounded-md bg-background/50 px-2 py-1">
						<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
							View
						</span>
						<Select
							onValueChange={(v) =>
								onViewModeChange(v as "standard" | "ai-ranked")
							}
							value={viewMode}
						>
							<SelectTrigger className="h-7 w-[110px] border-0 bg-transparent text-xs shadow-none focus:ring-1 focus:ring-primary/50">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="standard">
									<span className="flex items-center gap-1.5">
										<svg
											aria-hidden="true"
											className="h-3.5 w-3.5"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												d="M4 6h16M4 12h16M4 18h16"
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
											/>
										</svg>
										Standard
									</span>
								</SelectItem>
								<SelectItem value="ai-ranked">
									<span className="flex items-center gap-1.5">
										<svg
											aria-hidden="true"
											className="h-3.5 w-3.5"
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
										AI Ranked
									</span>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Separator */}
					<div className="h-6 w-px bg-border/50" />

					{viewMode === "standard" && (
						<>
							{/* Sort controls */}
							<div className="flex items-center gap-2 rounded-md bg-background/50 px-2 py-1">
								<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Sort
								</span>
								<Select
									onValueChange={(v) => onSortByChange(v as typeof sortBy)}
									value={sortBy}
								>
									<SelectTrigger className="h-7 w-[90px] border-0 bg-transparent text-xs shadow-none focus:ring-1 focus:ring-primary/50">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="createdAt">Date</SelectItem>
										<SelectItem value="priority">Priority</SelectItem>
										<SelectItem value="aiScore">AI Score</SelectItem>
									</SelectContent>
								</Select>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
											onClick={() =>
												onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")
											}
											size="sm"
											variant="ghost"
										>
											{sortOrder === "desc" ? (
												<svg
													aria-hidden="true"
													className="h-4 w-4"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M19 14l-7 7m0 0l-7-7m7 7V3"
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
													/>
												</svg>
											) : (
												<svg
													aria-hidden="true"
													className="h-4 w-4"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M5 10l7-7m0 0l7 7m-7-7v18"
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
													/>
												</svg>
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{sortOrder === "desc" ? "Descending" : "Ascending"}
									</TooltipContent>
								</Tooltip>
							</div>

							{/* Status filter */}
							<div className="flex items-center gap-2 rounded-md bg-background/50 px-2 py-1">
								<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Status
								</span>
								<Select
									onValueChange={onStatusFilterChange}
									value={statusFilter}
								>
									<SelectTrigger className="h-7 w-[105px] border-0 bg-transparent text-xs shadow-none focus:ring-1 focus:ring-primary/50">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Statuses</SelectItem>
										<SelectItem value="open">
											<span className="flex items-center gap-1.5">
												<span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
												Open
											</span>
										</SelectItem>
										<SelectItem value="in_progress">
											<span className="flex items-center gap-1.5">
												<span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
												In Progress
											</span>
										</SelectItem>
										<SelectItem value="review">
											<span className="flex items-center gap-1.5">
												<span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
												Review
											</span>
										</SelectItem>
										<SelectItem value="done">
											<span className="flex items-center gap-1.5">
												<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
												Done
											</span>
										</SelectItem>
										<SelectItem value="closed">
											<span className="flex items-center gap-1.5">
												<span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
												Closed
											</span>
										</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Separator */}
							<div className="h-6 w-px bg-border/50" />
						</>
					)}

					{/* Ticket count */}
					<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<svg
							aria-hidden="true"
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
							/>
						</svg>
						<span className="font-medium tabular-nums">
							{tickets?.length ?? 0}
						</span>
						<span>tickets</span>
					</div>

					{/* AI Rank button */}
					<div className="ml-auto">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									className="gap-1.5 shadow-sm"
									disabled={
										rankMutation.isPending || !ticketsQuery.data?.length
									}
									onClick={handleRankAll}
									size="sm"
									variant={rankMutation.isPending ? "secondary" : "default"}
								>
									{rankMutation.isPending ? (
										<>
											<svg
												aria-hidden="true"
												className="h-3.5 w-3.5 animate-spin"
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
											Ranking...
										</>
									) : (
										<>
											<svg
												aria-hidden="true"
												className="h-3.5 w-3.5"
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
											AI Rank All
										</>
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								Analyze and rank tickets by AI priority scoring
							</TooltipContent>
						</Tooltip>
					</div>
				</div>

				{/* Table with improved styling */}
				<div className="overflow-hidden rounded-xl border border-border/50 bg-card/20">
					<Table>
						<TableHeader>
							<TableRow className="border-border/30 bg-muted/30 hover:bg-muted/30">
								<TableHead className="w-[45%] py-3 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Ticket
								</TableHead>
								<TableHead className="py-3 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Status
								</TableHead>
								<TableHead className="py-3 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Priority
								</TableHead>
								<TableHead className="py-3 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Source
								</TableHead>
								{viewMode === "ai-ranked" && (
									<TableHead className="py-3 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
										AI Score
									</TableHead>
								)}
								<TableHead className="py-3 text-right font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Created
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{tickets?.length === 0 ? (
								<TableRow>
									<TableCell
										className="py-16 text-center"
										colSpan={viewMode === "ai-ranked" ? 6 : 5}
									>
										<div className="flex flex-col items-center gap-3">
											<div className="rounded-full bg-muted/50 p-4">
												<svg
													aria-hidden="true"
													className="h-8 w-8 text-muted-foreground"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={1.5}
													/>
												</svg>
											</div>
											<div className="space-y-1">
												<p className="font-medium text-foreground text-sm">
													No tickets found
												</p>
												<p className="text-muted-foreground text-xs">
													Create one manually or sync from a provider
												</p>
											</div>
										</div>
									</TableCell>
								</TableRow>
							) : (
								tickets?.map((ticket) => {
									const isPendingAnalysis = pendingAskTicketIds.has(ticket.id);
									const hasAIScore = ticket.aiScore !== null;

									return (
										<TableRow
											className="group cursor-pointer border-border/20 transition-all hover:bg-muted/40"
											key={ticket.id}
											onClick={() => onTicketSelect(ticket)}
										>
											<TableCell className="py-3.5">
												<div className="flex items-start gap-3">
													{/* Priority indicator line */}
													<div
														className={`mt-1.5 h-4 w-1 rounded-full ${
															ticket.priority === "urgent"
																? "bg-red-400"
																: ticket.priority === "high"
																	? "bg-orange-400"
																	: ticket.priority === "medium"
																		? "bg-amber-400"
																		: "bg-slate-400"
														}`}
													/>
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-2">
															{isPendingAnalysis && (
																<div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
																	<svg
																		aria-hidden="true"
																		className="h-3 w-3 animate-spin text-primary"
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
																</div>
															)}
															<Tooltip>
																<TooltipTrigger asChild>
																	<span className="truncate font-medium text-sm group-hover:text-foreground">
																		{ticket.title}
																	</span>
																</TooltipTrigger>
																<TooltipContent className="max-w-md" side="top">
																	{ticket.title}
																</TooltipContent>
															</Tooltip>
														</div>
														<div className="mt-1 flex items-center gap-2 text-xs">
															{ticket.externalId && (
																<span className="font-mono text-muted-foreground">
																	#{ticket.externalId}
																</span>
															)}
															{ticket.assignee && (
																<>
																	{ticket.externalId && (
																		<span className="text-muted-foreground/50">
																			·
																		</span>
																	)}
																	<span className="text-muted-foreground">
																		{ticket.assignee}
																	</span>
																</>
															)}
														</div>
													</div>
												</div>
											</TableCell>
											<TableCell>
												<Badge
													className={`font-medium text-[11px] ${STATUS_STYLES[ticket.status]}`}
													variant="outline"
												>
													{ticket.status.replace("_", " ")}
												</Badge>
											</TableCell>
											<TableCell>
												<Badge
													className={`font-medium text-[11px] ${PRIORITY_STYLES[ticket.priority ?? "medium"]}`}
													variant="outline"
												>
													<span className="mr-1 opacity-70">
														{PRIORITY_ICONS[ticket.priority ?? "medium"]}
													</span>
													{ticket.priority}
												</Badge>
											</TableCell>
											<TableCell>
												<span
													className={`flex items-center gap-1.5 text-xs capitalize ${PROVIDER_STYLES[ticket.provider] ?? "text-muted-foreground"}`}
												>
													{ticket.provider === "jira" && (
														<svg
															aria-hidden="true"
															className="h-3.5 w-3.5"
															fill="currentColor"
															viewBox="0 0 24 24"
														>
															<path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.362 4.362 0 004.34 4.34h1.8v1.72a4.362 4.362 0 004.34 4.34V7.63a.84.84 0 00-.83-.83H6.77zM2 11.6c0 2.4 1.95 4.34 4.35 4.35h1.78v1.7c.01 2.39 1.95 4.34 4.35 4.35v-9.57a.84.84 0 00-.84-.84H2z" />
														</svg>
													)}
													{ticket.provider === "linear" && (
														<svg
															aria-hidden="true"
															className="h-3.5 w-3.5"
															fill="currentColor"
															viewBox="0 0 24 24"
														>
															<path d="M3 15.055v-.684c.126.053.255.1.39.14a2.94 2.94 0 001.53-.06l9.56-2.89a.96.96 0 00.68-.92v-1.3a.96.96 0 00-.68-.92l-9.56-2.89a2.94 2.94 0 00-1.53-.06c-.135.04-.264.087-.39.14v-.684A2.945 2.945 0 005.945 2H18.055A2.945 2.945 0 0021 4.945v14.11A2.945 2.945 0 0018.055 22H5.945A2.945 2.945 0 003 19.055v-4z" />
														</svg>
													)}
													{ticket.provider === "docker" && (
														<svg
															aria-hidden="true"
															className="h-3.5 w-3.5"
															fill="currentColor"
															viewBox="0 0 24 24"
														>
															<path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185zm-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.186zm0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186zm-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186zm-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186zm5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185zm-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185zm-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186h-2.119a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185zm-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185zm23.693-3.328c-.085-.076-.235-.083-.403-.076-.053.002-.697.051-1.381.206l-.004.002a2.113 2.113 0 00-.275-.502c-.5-.705-1.239-.894-1.785-.897-.56-.003-1.032.135-1.407.402-.258-.14-.542-.254-.847-.338a6.875 6.875 0 00-1.014-.195c.008-.173.012-.348.012-.525 0-.36-.024-.709-.068-1.043a7.166 7.166 0 00-.285-1.163H2.172a.185.185 0 00-.186.186v1.887c0 .102.084.186.186.186h2.12a.185.185 0 00.184-.186v-.78h17.31c.114.335.2.684.258 1.043.044.288.068.59.068.9a5.9 5.9 0 01-.082.983 6.5 6.5 0 01-.226.809c-.013.036-.026.072-.04.108l.008.003c-.014.036-.028.072-.044.107a6.126 6.126 0 01-.5.936 5.91 5.91 0 01-1.4 1.496c-.167.132-.34.254-.52.366-.092.056-.184.11-.279.162l-.094.05c-.097.05-.195.099-.295.143-.048.022-.097.043-.146.064l-.125.049c-.052.02-.104.039-.157.057l-.11.037c-.062.02-.125.039-.188.056-.04.01-.079.021-.119.03-.074.018-.149.036-.224.05a6.042 6.042 0 01-.53.076 6.25 6.25 0 01-.53.03H11.99c-.48 0-.948-.052-1.398-.152l-.034-.008a6.008 6.008 0 01-.406-.11c-.044-.013-.088-.027-.131-.042a5.99 5.99 0 01-.396-.148l-.056-.024a5.91 5.91 0 01-.393-.187l-.017-.01a5.851 5.851 0 01-.784-.48 5.885 5.885 0 01-1.438-1.558 5.882 5.882 0 01-.587-1.107v-.001c.014-.002.027-.003.04-.004z" />
														</svg>
													)}
													{ticket.provider === "manual" && (
														<svg
															aria-hidden="true"
															className="h-3.5 w-3.5"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
															/>
														</svg>
													)}
													{ticket.provider}
												</span>
											</TableCell>
											{viewMode === "ai-ranked" && (
												<TableCell>
													{hasAIScore ? (
														(() => {
															const aiScore = ticket.aiScore ?? 0;
															const scoreColor =
																aiScore >= 7
																	? "bg-red-400"
																	: aiScore >= 5
																		? "bg-amber-400"
																		: "bg-emerald-400";
															return (
																<div className="flex items-center gap-1.5">
																	<div
																		className={`h-2 w-2 rounded-full ${scoreColor}`}
																	/>
																	<span className="font-medium font-mono text-sm tabular-nums">
																		{aiScore.toFixed(1)}
																	</span>
																</div>
															);
														})()
													) : (
														<span className="text-muted-foreground text-xs">
															—
														</span>
													)}
												</TableCell>
											)}
											<TableCell className="text-right">
												<span className="text-muted-foreground text-xs tabular-nums">
													{new Date(ticket.createdAt).toLocaleDateString(
														undefined,
														{
															month: "short",
															day: "numeric",
														},
													)}
												</span>
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>
			</div>
		</TooltipProvider>
	);
}
