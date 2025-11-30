import type { Part } from "../types";

interface ProgressIndicatorProps {
	parts: Part[];
	isRunning: boolean;
}

export function ProgressIndicator({
	parts,
	isRunning,
}: ProgressIndicatorProps) {
	// Filter for completed tool parts
	const completedTools = parts.filter(
		(p) => p.type === "tool" && (p as any).state?.status === "completed",
	);

	// Get the last part to determine current activity
	const lastPart = parts[parts.length - 1];
	const getActivityMessage = () => {
		if (!lastPart) return "Initializing...";

		if (lastPart.type === "tool") {
			const tool = (lastPart as any).tool;
			const status = (lastPart as any).state?.status;

			if (status === "running") {
				switch (tool) {
					case "task":
						return "Delegating work...";
					case "todowrite":
					case "todoread":
						return "Planning next steps...";
					case "read":
					case "list":
					case "grep":
					case "glob":
						return "Searching the codebase...";
					case "webfetch":
						return "Searching the web...";
					case "edit":
					case "write":
						return "Making edits...";
					case "bash":
						return "Running commands...";
					default:
						return `Running ${tool}...`;
				}
			}
		}

		if (lastPart.type === "reasoning") {
			return "Thinking...";
		}

		if (lastPart.type === "text") {
			return "Gathering thoughts...";
		}

		return "Processing...";
	};

	if (!isRunning && completedTools.length === 0) {
		return null;
	}

	return (
		<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
			<div className="flex items-center gap-2 mb-3">
				<div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
				<span className="font-medium text-blue-900">
					{isRunning ? getActivityMessage() : "Completed"}
				</span>
			</div>

			{completedTools.length > 0 && (
				<div className="space-y-1">
					<div className="text-xs text-blue-700 mb-2">
						Completed steps ({completedTools.length}):
					</div>
					{completedTools.map((part, idx) => {
						const tool = (part as any).tool;
						return (
							<div
								key={idx}
								className="text-xs text-blue-600 flex items-center gap-2"
							>
								<span>✓</span>
								<span className="font-mono">{tool}</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
