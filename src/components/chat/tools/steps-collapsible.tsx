"use client";

import { useState } from "react";
import type { ToolPart } from "@/server/tickets/opencode";
import { api } from "@/trpc/react";
import { ToolCallDisplay } from "./tool-call-display";

interface StepsCollapsibleProps {
	toolParts: ToolPart[];
}

/**
 * Collapsible container for all tool calls in a message
 */
export function StepsCollapsible({ toolParts }: StepsCollapsibleProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const { data: capabilities } = api.agentServer.getCapabilities.useQuery();

	// Show placeholder if provider doesn't support tool calls
	if (!capabilities?.toolCalls) {
		return (
			<div className="mt-3 rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-muted-foreground text-xs italic">
				Tool call tracking not available for this provider
			</div>
		);
	}

	if (toolParts.length === 0) return null;

	return (
		<div className="mt-3">
			<button
				className="flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
				onClick={() => setIsExpanded(!isExpanded)}
				type="button"
			>
				<svg
					aria-hidden="true"
					className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						d="M9 5l7 7-7 7"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
					/>
				</svg>
				<span>Check steps ({toolParts.length})</span>
			</button>
			{isExpanded && (
				<div className="mt-2 space-y-1">
					{toolParts.map((tool) => (
						<ToolCallDisplay key={tool.id} tool={tool} />
					))}
				</div>
			)}
		</div>
	);
}
