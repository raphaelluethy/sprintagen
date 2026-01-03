"use client";

import { useState } from "react";

interface ReasoningDisplayProps {
	reasoning: string;
}

/**
 * Collapsible reasoning display for AI messages
 */
export function ReasoningDisplay({ reasoning }: ReasoningDisplayProps) {
	const [showReasoning, setShowReasoning] = useState(false);

	return (
		<div className="mb-3">
			<button
				className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
				onClick={() => setShowReasoning(!showReasoning)}
				type="button"
			>
				<svg
					aria-hidden="true"
					className={`h-3 w-3 transition-transform ${showReasoning ? "rotate-90" : ""}`}
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
				Reasoning
			</button>
			{showReasoning && (
				<div className="mt-2 rounded border border-border/40 bg-secondary/30 p-2 text-muted-foreground text-xs italic">
					{reasoning}
				</div>
			)}
		</div>
	);
}
