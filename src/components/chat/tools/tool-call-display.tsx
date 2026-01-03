"use client";

import { useState } from "react";
import type { ToolPart } from "@/server/tickets/opencode";

type ToolState = ToolPart["state"];

/** Get tool title based on state */
function getToolTitle(state: ToolState): string | undefined {
	if (state.status === "completed" || state.status === "running") {
		return state.title;
	}
	return undefined;
}

/** Get tool output */
function getToolOutput(state: ToolState): string | undefined {
	if (state.status === "completed") {
		return state.output;
	}
	if (state.status === "error") {
		return state.error;
	}
	return undefined;
}

/** Get tool preview from metadata */
function getToolPreview(state: ToolState): string | undefined {
	if (state.status === "completed" && state.metadata?.preview) {
		return state.metadata.preview as string;
	}
	return undefined;
}

/** Get a readable summary for specific tool types */
function getToolSummary(tool: ToolPart): string {
	const state = tool.state;
	const input = state.input;

	switch (tool.tool) {
		case "read":
			return input.filePath as string;
		case "edit":
			return `${input.filePath as string}`;
		case "write":
			return `${input.filePath as string}`;
		case "bash":
			return (input.command as string).slice(0, 50);
		case "grep":
		case "glob":
			return `${input.pattern as string}`;
		case "webfetch":
			return `${input.url as string}`;
		case "task":
			return `${(input.description as string) || (input.prompt as string) || ""}`.slice(
				0,
				50,
			);
		default:
			return JSON.stringify(input).slice(0, 50);
	}
}

const STATUS_STYLES = {
	completed: "bg-foreground/5 text-foreground/60",
	error: "bg-destructive/10 text-destructive",
	running: "bg-foreground/5 text-foreground/60 animate-pulse",
	pending: "bg-foreground/5 text-foreground/40",
};

const STATUS_ICONS = {
	completed: "\u2713",
	error: "\u2717",
	running: "\u27F3",
	pending: "\u25CB",
};

interface ToolCallDisplayProps {
	tool: ToolPart;
}

/**
 * Individual tool call display with expandable details
 */
export function ToolCallDisplay({ tool }: ToolCallDisplayProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const title = getToolTitle(tool.state);
	const output = getToolOutput(tool.state);
	const preview = getToolPreview(tool.state);

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
				<span className="text-muted-foreground">{"\u2192"}</span>
				<span className="flex-1 truncate text-muted-foreground">
					{title || getToolSummary(tool)}
				</span>
				<span
					className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-[10px] ${STATUS_STYLES[tool.state.status]}`}
				>
					<span>{STATUS_ICONS[tool.state.status]}</span>
					<span>{tool.state.status}</span>
				</span>
			</button>
			{isExpanded && (
				<div className="space-y-2 border-border/60 border-t bg-background/50 p-3">
					{/* Tool-specific input rendering */}
					<div>
						<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
							Input
						</span>
						{tool.tool === "bash" ? (
							<pre className="mt-1 overflow-x-auto rounded bg-secondary/50 p-2 font-mono text-foreground/80 text-xs">
								$ {tool.state.input.command as string}
							</pre>
						) : tool.tool === "read" ||
							tool.tool === "edit" ||
							tool.tool === "write" ? (
							<div className="mt-1 rounded bg-secondary/50 p-2 text-xs">
								<span className="font-mono text-foreground/80">
									{"\uD83D\uDCC4"} {tool.state.input.filePath as string}
								</span>
							</div>
						) : (
							<pre className="mt-1 overflow-x-auto rounded bg-secondary/50 p-2 text-foreground/80 text-xs">
								{JSON.stringify(tool.state.input, null, 2)}
							</pre>
						)}
					</div>

					{/* Output display */}
					{output && (
						<div>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
								{tool.state.status === "error" ? "Error" : "Output"}
							</span>
							<pre
								className={`mt-1 max-h-64 overflow-x-auto overflow-y-auto rounded bg-secondary/50 p-2 font-mono text-xs ${
									tool.state.status === "error"
										? "text-destructive"
										: "text-foreground/80"
								}`}
							>
								{preview || output.slice(0, 1000)}
								{output.length > 1000 && !preview && "\n... (truncated)"}
							</pre>
						</div>
					)}

					{/* Show timing information for completed tools */}
					{tool.state.status === "completed" && tool.state.time && (
						<div className="text-[10px] text-muted-foreground">
							Duration:{" "}
							{((tool.state.time.end - tool.state.time.start) / 1000).toFixed(
								2,
							)}
							s
						</div>
					)}
				</div>
			)}
		</div>
	);
}
