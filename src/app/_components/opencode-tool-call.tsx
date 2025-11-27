"use client";

import { useState } from "react";
import type { ToolPart, ToolState } from "@/server/tickets/opencode";

// Reasoning display component
export function OpencodeReasoningDisplay({ reasoning }: { reasoning: string }) {
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

// Helper to get tool title based on state
function getToolTitle(state: ToolState): string | undefined {
	if (state.status === "completed" || state.status === "running") {
		return state.title;
	}
	return undefined;
}

// Helper to get tool output
function getToolOutput(state: ToolState): string | undefined {
	if (state.status === "completed") {
		return state.output;
	}
	if (state.status === "error") {
		return state.error;
	}
	return undefined;
}

// Helper to get tool preview
function getToolPreview(state: ToolState): string | undefined {
	if (state.status === "completed" && state.metadata?.preview) {
		return state.metadata.preview as string;
	}
	return undefined;
}

// Tool call component
export function OpencodeToolCallDisplay({ tool }: { tool: ToolPart }) {
	const [isExpanded, setIsExpanded] = useState(false);
	const title = getToolTitle(tool.state);
	const output = getToolOutput(tool.state);
	const preview = getToolPreview(tool.state);

	const statusStyles = {
		completed: "bg-foreground/5 text-foreground/60",
		error: "bg-destructive/10 text-destructive",
		running: "bg-foreground/5 text-foreground/60",
		pending: "bg-foreground/5 text-foreground/40",
	};

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
					{title || JSON.stringify(tool.state.input).slice(0, 50)}
				</span>
				<span
					className={`rounded px-1.5 py-0.5 font-medium text-[10px] ${statusStyles[tool.state.status]}`}
				>
					{tool.state.status}
				</span>
			</button>
			{isExpanded && (
				<div className="space-y-2 border-border/60 border-t bg-background/50 p-3">
					<div>
						<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
							Input
						</span>
						<pre className="mt-1 overflow-x-auto rounded bg-secondary/50 p-2 text-foreground/80 text-xs">
							{JSON.stringify(tool.state.input, null, 2)}
						</pre>
					</div>
					{output && (
						<div>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
								{tool.state.status === "error" ? "Error" : "Output"}
							</span>
							<pre
								className={`mt-1 max-h-64 overflow-x-auto overflow-y-auto rounded bg-secondary/50 p-2 text-xs ${
									tool.state.status === "error"
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
