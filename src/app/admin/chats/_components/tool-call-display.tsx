"use client";

import { useState } from "react";
import type { ToolPart } from "@opencode-ai/sdk";
import {
	type ToolState,
	getToolTitle,
	getToolOutput,
	getToolPreview,
} from "@/lib/opencode-utils";

interface ToolCallDisplayProps {
	tool: ToolPart;
}

const statusStyles = {
	completed: "bg-foreground/5 text-foreground/60",
	error: "bg-destructive/10 text-destructive",
	running: "bg-foreground/5 text-foreground/60",
	pending: "bg-foreground/5 text-foreground/40",
};

export function ToolCallDisplay({ tool }: ToolCallDisplayProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const state = tool.state as ToolState;
	const title = getToolTitle(state);
	const output = getToolOutput(state);
	const preview = getToolPreview(state);

	return (
		<div className="my-2 overflow-hidden rounded-md border border-border/60 bg-card/50">
			<button
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-secondary/50"
				onClick={() => setIsExpanded(!isExpanded)}
				type="button"
			>
				<svg
					aria-hidden="true"
					className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
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
				<span className="font-mono text-foreground">{tool.tool}</span>
				<span className="text-muted-foreground">→</span>
				<span className="flex-1 truncate text-muted-foreground">
					{title || JSON.stringify(state.input).slice(0, 50)}
				</span>
				<span
					className={`rounded px-1.5 py-0.5 font-medium text-[10px] ${statusStyles[state.status]}`}
				>
					{state.status}
				</span>
			</button>
			{isExpanded && (
				<div className="space-y-2 border-border/60 border-t bg-background/50 p-3">
					<div>
						<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
							Input
						</span>
						<pre className="mt-1 overflow-x-auto rounded bg-secondary/50 p-2 text-foreground/80 text-xs">
							{JSON.stringify(state.input, null, 2)}
						</pre>
					</div>
					{output && (
						<div>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
								{state.status === "error" ? "Error" : "Output"}
							</span>
							<pre
								className={`mt-1 max-h-64 overflow-x-auto overflow-y-auto rounded bg-secondary/50 p-2 text-xs ${
									state.status === "error"
										? "text-destructive"
										: "text-foreground/80"
								}`}
							>
								{preview || output.slice(0, 1000)}
								{output.length > 1000 && !preview && "..."}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
