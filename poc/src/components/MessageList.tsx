import type { Message, Part } from "../types";
import { ToolCall } from "./ToolCall";
import { ProgressIndicator } from "./ProgressIndicator";

interface MessageListProps {
	messages: Array<{ info: Message; parts: Part[] }>;
	sessionStatus: "idle" | "running" | "error";
}

export function MessageList({ messages, sessionStatus }: MessageListProps) {
	if (messages.length === 0) {
		return (
			<div className="text-center text-gray-500 py-8">
				No messages yet. Send a prompt to get started!
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{messages.map((msg, idx) => {
				const isUser = msg.info.role === "user";
				const isAssistant = msg.info.role === "assistant";

				// Collect all parts for progress indicator
				const allParts = msg.parts || [];

				return (
					<div key={idx} className="border rounded-lg p-4 bg-white shadow-sm">
						{/* Message Header */}
						<div className="flex items-center gap-2 mb-3">
							<span className="text-2xl">{isUser ? "👤" : "🤖"}</span>
							<span className="font-semibold">
								{isUser ? "User" : "Assistant"}
							</span>
							<span className="text-xs text-gray-500">
								{new Date(msg.info.time.created).toLocaleTimeString()}
							</span>
						</div>

						{/* User Message Content */}
						{isUser && (
							<div className="mb-3">
								{allParts
									.filter((p) => p.type === "text")
									.map((p, i) => (
										<div
											key={i}
											className="bg-gray-50 p-3 rounded border border-gray-200"
										>
											<div className="font-medium text-sm text-gray-700 mb-1">
												Input:
											</div>
											<div className="whitespace-pre-wrap font-mono text-sm">
												{(p as any).text}
											</div>
										</div>
									))}
							</div>
						)}

						{/* Assistant Message Content */}
						{isAssistant && (
							<div>
								{/* Progress Indicator (if running) */}
								{sessionStatus === "running" && idx === messages.length - 1 && (
									<ProgressIndicator parts={allParts} isRunning={true} />
								)}

								{/* Text Response */}
								{allParts
									.filter((p) => p.type === "text")
									.map((p, i) => (
										<div
											key={i}
											className="bg-blue-50 p-3 rounded border border-blue-200 mb-3"
										>
											<div className="font-medium text-sm text-blue-700 mb-1">
												Response:
											</div>
											<div className="whitespace-pre-wrap text-sm">
												{(p as any).text}
											</div>
										</div>
									))}

								{/* Tool Calls */}
								{allParts.some((p) => p.type === "tool") && (
									<details open={sessionStatus === "running"} className="mt-3">
										<summary className="cursor-pointer font-medium text-sm text-gray-700 mb-2">
											Tool Calls (
											{allParts.filter((p) => p.type === "tool").length})
										</summary>
										<div className="ml-4">
											{allParts
												.filter((p) => p.type === "tool")
												.map((p, i) => (
													<ToolCall key={i} part={p} />
												))}
										</div>
									</details>
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
