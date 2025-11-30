import type { Part } from "../types";

interface ToolCallProps {
	part: Part;
}

export function ToolCall({ part }: ToolCallProps) {
	if (part.type !== "tool") return null;

	const toolPart = part as any; // Type assertion for tool part
	const { tool, state } = toolPart;

	const getStatusColor = () => {
		switch (state.status) {
			case "pending":
				return "bg-gray-100 text-gray-700 border-gray-300";
			case "running":
				return "bg-blue-100 text-blue-700 border-blue-300";
			case "completed":
				return "bg-green-100 text-green-700 border-green-300";
			case "error":
				return "bg-red-100 text-red-700 border-red-300";
			default:
				return "bg-gray-100 text-gray-700 border-gray-300";
		}
	};

	const getStatusIcon = () => {
		switch (state.status) {
			case "pending":
				return "⏳";
			case "running":
				return "🔄";
			case "completed":
				return "✅";
			case "error":
				return "❌";
			default:
				return "•";
		}
	};

	return (
		<div className={`border rounded-lg p-4 mb-3 ${getStatusColor()}`}>
			<div className="flex items-center gap-2 mb-2">
				<span className="text-lg">{getStatusIcon()}</span>
				<span className="font-mono font-semibold">{tool}</span>
				<span className="text-xs uppercase px-2 py-0.5 rounded bg-white/50">
					{state.status}
				</span>
			</div>

			{/* Input */}
			{state.status === "completed" && state.input && (
				<details className="mb-2">
					<summary className="cursor-pointer text-sm font-medium mb-1">
						Input
					</summary>
					<pre className="text-xs bg-black/5 p-2 rounded overflow-x-auto">
						{JSON.stringify(state.input, null, 2)}
					</pre>
				</details>
			)}

			{/* Output */}
			{state.status === "completed" && state.output && (
				<div className="mt-2">
					<div className="text-sm font-medium mb-1">Output:</div>
					<pre className="text-xs bg-black/5 p-2 rounded overflow-x-auto max-h-64 overflow-y-auto">
						{state.output}
					</pre>
				</div>
			)}

			{/* Error */}
			{state.status === "error" && state.error && (
				<div className="mt-2">
					<div className="text-sm font-medium mb-1">Error:</div>
					<pre className="text-xs bg-red-50 p-2 rounded">{state.error}</pre>
				</div>
			)}

			{/* Metadata */}
			{state.metadata && Object.keys(state.metadata).length > 0 && (
				<details className="mt-2">
					<summary className="cursor-pointer text-sm font-medium mb-1">
						Metadata
					</summary>
					<pre className="text-xs bg-black/5 p-2 rounded overflow-x-auto">
						{JSON.stringify(state.metadata, null, 2)}
					</pre>
				</details>
			)}
		</div>
	);
}
