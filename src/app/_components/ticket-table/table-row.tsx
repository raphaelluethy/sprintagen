"use client";

import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { PRIORITY_STYLES, STATUS_STYLES } from "@/lib/constants";
import type { TicketWithRelations } from "@/types";

interface TicketRowProps {
	ticket: TicketWithRelations;
	isPendingAnalysis: boolean;
	showAiScore: boolean;
	onSelect: () => void;
}

export function TicketRow({
	ticket,
	isPendingAnalysis,
	showAiScore,
	onSelect,
}: TicketRowProps) {
	return (
		<TableRow
			className="cursor-pointer border-border/40 transition-colors hover:bg-secondary/30"
			onClick={onSelect}
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
						<div className="font-medium text-sm">{ticket.title}</div>
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
					{ticket.priority ?? "medium"}
				</Badge>
			</TableCell>
			<TableCell>
				<span className="text-muted-foreground text-xs capitalize">
					{ticket.provider}
				</span>
			</TableCell>
			{showAiScore && (
				<TableCell>
					{ticket.aiScore !== null ? (
						<span className="font-mono text-sm tabular-nums">
							{ticket.aiScore.toFixed(1)}
						</span>
					) : (
						<span className="text-muted-foreground">{"\u2014"}</span>
					)}
				</TableCell>
			)}
			<TableCell className="text-right text-muted-foreground text-xs tabular-nums">
				{new Date(ticket.createdAt).toLocaleDateString()}
			</TableCell>
		</TableRow>
	);
}
