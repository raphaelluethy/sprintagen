"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { ToolPart } from "@/server/tickets/opencode";

type ToolState = ToolPart["state"];

// Collapsible container for all tool calls in a message
export function OpencodeStepsCollapsible({
	toolParts,
}: {
	toolParts: ToolPart[];
}) {
	const [isExpanded, setIsExpanded] = useState(false);

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
						<OpencodeToolCallDisplay key={tool.id} tool={tool} />
					))}
				</div>
			)}
		</div>
	);
}

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

// Helper to get a readable summary for specific tool types
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

// Tool call component
export function OpencodeToolCallDisplay({ tool }: { tool: ToolPart }) {
	const [isExpanded, setIsExpanded] = useState(false);
	const title = getToolTitle(tool.state);
	const output = getToolOutput(tool.state);
	const preview = getToolPreview(tool.state);

	const statusStyles = {
		completed: "bg-foreground/5 text-foreground/60",
		error: "bg-destructive/10 text-destructive",
		running: "bg-foreground/5 text-foreground/60 animate-pulse",
		pending: "bg-foreground/5 text-foreground/40",
	};

	const statusIcons = {
		completed: "✓",
		error: "✗",
		running: "⟳",
		pending: "○",
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
					{title || getToolSummary(tool)}
				</span>
				<span
					className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-[10px] ${statusStyles[tool.state.status]}`}
				>
					<span>{statusIcons[tool.state.status]}</span>
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
									📄 {tool.state.input.filePath as string}
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

// Live tool steps block for showing analysis progress (used in AI Insights tab)
export function ToolStepsBlock({
	toolParts,
	timestamp,
	model,
}: {
	toolParts: ToolPart[];
	timestamp?: Date;
	model?: string;
}) {
	const [isExpanded, setIsExpanded] = useState(false);

	const completedCount = toolParts.filter(
		(t) => t.state.status === "completed",
	).length;
	const runningCount = toolParts.filter(
		(t) => t.state.status === "running",
	).length;
	const errorCount = toolParts.filter((t) => t.state.status === "error").length;

	return (
		<div className="relative pl-8">
			<div className="absolute top-2 left-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-amber-500 ring-4 ring-background" />

			<div className="mb-2 flex items-center gap-2">
				{timestamp && (
					<time className="font-medium text-muted-foreground text-xs">
						{timestamp.toLocaleString(undefined, {
							dateStyle: "medium",
							timeStyle: "short",
						})}
					</time>
				)}
				<span className="font-medium text-amber-600 text-xs uppercase tracking-wider dark:text-amber-400">
					Working
				</span>
				{model && (
					<Badge
						className="h-5 px-1.5 font-normal text-[10px]"
						variant="outline"
					>
						{model}
					</Badge>
				)}
			</div>

			<div className="overflow-hidden rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-amber-600/10">
				<button
					className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-amber-500/5"
					onClick={() => setIsExpanded(!isExpanded)}
					type="button"
				>
					<svg
						aria-hidden="true"
						className={`h-3.5 w-3.5 text-amber-600 transition-transform dark:text-amber-400 ${isExpanded ? "rotate-90" : ""}`}
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

					<div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/15">
						<svg
							aria-hidden="true"
							className="h-4 w-4 text-amber-600 dark:text-amber-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
							/>
						</svg>
					</div>

					<div className="flex-1">
						<span className="font-medium text-foreground text-sm">
							{toolParts.length} step{toolParts.length !== 1 ? "s" : ""}
						</span>
						<span className="ml-2 text-muted-foreground text-xs">
							{runningCount > 0 && (
								<span className="text-amber-600 dark:text-amber-400">
									{runningCount} running
								</span>
							)}
							{runningCount > 0 &&
								(completedCount > 0 || errorCount > 0) &&
								" · "}
							{completedCount > 0 && <span>{completedCount} completed</span>}
							{completedCount > 0 && errorCount > 0 && " · "}
							{errorCount > 0 && (
								<span className="text-destructive">{errorCount} failed</span>
							)}
						</span>
					</div>

					{/* Status indicator */}
					{runningCount > 0 ? (
						<div className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-1">
							<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
							<span className="font-medium text-[10px] text-amber-600 dark:text-amber-400">
								Running
							</span>
						</div>
					) : errorCount > 0 ? (
						<div className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-1">
							<span className="text-destructive text-xs">!</span>
							<span className="font-medium text-[10px] text-destructive">
								Error
							</span>
						</div>
					) : (
						<div className="flex items-center gap-1.5 rounded-full bg-foreground/5 px-2 py-1">
							<span className="text-muted-foreground text-xs">✓</span>
							<span className="font-medium text-[10px] text-muted-foreground">
								Done
							</span>
						</div>
					)}
				</button>

				{isExpanded && (
					<div className="border-amber-500/10 border-t bg-background/50 p-2">
						<div className="space-y-1">
							{toolParts.map((tool) => (
								<ToolStepItem key={tool.id} tool={tool} />
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// Individual tool step item used in ToolStepsBlock
export function ToolStepItem({ tool }: { tool: ToolPart }) {
	const [isExpanded, setIsExpanded] = useState(false);

	const statusStyles = {
		completed: "text-muted-foreground",
		error: "text-destructive",
		running: "text-amber-600 dark:text-amber-400",
		pending: "text-muted-foreground/50",
	};

	const statusIcons = {
		completed: "✓",
		error: "✗",
		running: "◎",
		pending: "○",
	};

	const getToolSummary = () => {
		const input = tool.state.input;
		switch (tool.tool) {
			case "read":
				return input.filePath as string;
			case "edit":
			case "write":
				return input.filePath as string;
			case "bash":
				return (input.command as string).slice(0, 60);
			case "grep":
			case "glob":
				return input.pattern as string;
			case "webfetch":
				return input.url as string;
			case "task":
				return (
					(input.description as string) ||
					(input.prompt as string) ||
					""
				).slice(0, 60);
			default:
				return JSON.stringify(input).slice(0, 60);
		}
	};

	const output =
		tool.state.status === "completed"
			? tool.state.output
			: tool.state.status === "error"
				? tool.state.error
				: undefined;

	return (
		<div className="overflow-hidden rounded border border-border/40 bg-card/30">
			<button
				className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-secondary/30"
				onClick={() => setIsExpanded(!isExpanded)}
				type="button"
			>
				<span
					className={`w-4 text-center ${statusStyles[tool.state.status]} ${tool.state.status === "running" ? "animate-pulse" : ""}`}
				>
					{statusIcons[tool.state.status]}
				</span>
				<span className="font-mono text-amber-700 dark:text-amber-300">
					{tool.tool}
				</span>
				<span className="text-muted-foreground/50">→</span>
				<span className="flex-1 truncate text-muted-foreground">
					{getToolSummary()}
				</span>
				<svg
					aria-hidden="true"
					className={`h-3 w-3 text-muted-foreground/50 transition-transform ${isExpanded ? "rotate-90" : ""}`}
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
			</button>

			{isExpanded && output && (
				<div className="border-border/40 border-t bg-secondary/20 p-2">
					<pre
						className={`max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] ${
							tool.state.status === "error"
								? "text-destructive"
								: "text-muted-foreground"
						}`}
					>
						{output.slice(0, 1500)}
						{output.length > 1500 && "\n... (truncated)"}
					</pre>
				</div>
			)}
		</div>
	);
}
