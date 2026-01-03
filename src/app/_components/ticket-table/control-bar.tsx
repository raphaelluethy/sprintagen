"use client";

import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface ControlBarProps {
	viewMode: "standard" | "ai-ranked";
	sortBy: "createdAt" | "priority" | "aiScore";
	sortOrder: "asc" | "desc";
	statusFilter: string;
	onViewModeChange: (view: "standard" | "ai-ranked") => void;
	onSortByChange: (sort: "createdAt" | "priority" | "aiScore") => void;
	onSortOrderChange: (order: "asc" | "desc") => void;
	onStatusFilterChange: (status: string) => void;
	onRankAll: () => void;
	isRanking: boolean;
	hasTickets: boolean;
}

export function ControlBar({
	viewMode,
	sortBy,
	sortOrder,
	statusFilter,
	onViewModeChange,
	onSortByChange,
	onSortOrderChange,
	onStatusFilterChange,
	onRankAll,
	isRanking,
	hasTickets,
}: ControlBarProps) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="flex items-center gap-2">
				<span className="text-muted-foreground text-xs uppercase tracking-wider">
					View
				</span>
				<Select
					onValueChange={(v) => onViewModeChange(v as "standard" | "ai-ranked")}
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
							{sortOrder === "desc" ? "\u2193" : "\u2191"}
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
					disabled={isRanking || !hasTickets}
					onClick={onRankAll}
					size="sm"
					variant="outline"
				>
					{isRanking ? "Ranking..." : "AI Rank All"}
				</Button>
			</div>
		</div>
	);
}
