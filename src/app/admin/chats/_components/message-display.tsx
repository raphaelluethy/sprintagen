"use client";

import { useState } from "react";
import type { Message } from "@opencode-ai/sdk";
import { Badge } from "@/components/ui/badge";
import {
	type MessageWithParts,
	getTextContent,
	getReasoningContent,
	getToolCalls,
	isUserMessage,
	isAssistantMessage,
} from "@/lib/opencode-utils";
import { ToolCallDisplay } from "./tool-call-display";

interface MessageDisplayProps {
	message: MessageWithParts;
}

/**
 * Simple markdown-like rendering for basic formatting
 */
function renderMarkdown(text: string): React.ReactNode {
	const parts = text.split(/(\*\*[^*]+\*\*|\n- |\n\*\*[^*]+:\*\*)/g);

	return parts.map((part, i) => {
		const key = `${i}-${part.slice(0, 10)}`;
		if (part.startsWith("**") && part.endsWith("**")) {
			return (
				<strong className="text-foreground" key={key}>
					{part.slice(2, -2)}
				</strong>
			);
		}
		if (part === "\n- ") {
			return <span key={key}>{"\n• "}</span>;
		}
		return <span key={key}>{part}</span>;
	});
}

export function MessageDisplay({ message }: MessageDisplayProps) {
	const textContent = getTextContent(message.parts);
	const reasoningContent = getReasoningContent(message.parts);
	const toolCalls = getToolCalls(message.parts);
	const isUser = isUserMessage(message.info);
	const [showReasoning, setShowReasoning] = useState(false);

	// Type assertion for assistant-specific fields
	const assistantInfo = message.info as Message & {
		mode?: string;
		providerID?: string;
		modelID?: string;
		tokens?: { input: number; output: number };
		finish?: string;
		error?: { name: string; data: Record<string, unknown> };
	};

	// Type assertion for user-specific fields
	const userInfo = message.info as Message & {
		agent?: string;
	};

	return (
		<div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
			<div
				className={`max-w-[85%] rounded-lg px-4 py-3 ${
					isUser
						? "bg-foreground text-background"
						: "border border-border/60 bg-card/50 text-foreground"
				}`}
			>
				{/* Role & Model badge for assistant */}
				{isAssistantMessage(message.info) && (
					<div className="mb-2 flex flex-wrap items-center gap-2 border-border/40 border-b pb-2">
						<span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
							{assistantInfo.mode || "assistant"}
						</span>
						<span className="text-border">•</span>
						<span className="font-mono text-[10px] text-muted-foreground">
							{assistantInfo.providerID}/{assistantInfo.modelID}
						</span>
						{assistantInfo.tokens && (
							<>
								<span className="text-border">•</span>
								<span className="text-[10px] text-muted-foreground">
									{assistantInfo.tokens.input + assistantInfo.tokens.output} tok
								</span>
							</>
						)}
						{assistantInfo.finish && (
							<Badge
								className="h-4 px-1 text-[10px]"
								variant={
									assistantInfo.finish === "stop" ? "default" : "secondary"
								}
							>
								{assistantInfo.finish}
							</Badge>
						)}
					</div>
				)}

				{/* User message agent/model info */}
				{isUser && userInfo.agent && (
					<div className="mb-2 flex items-center gap-2 border-background/20 border-b pb-2 text-background/70">
						<span className="text-[10px] uppercase tracking-wider">
							→ {userInfo.agent}
						</span>
					</div>
				)}

				{/* Reasoning section (collapsible) */}
				{!isUser && reasoningContent && (
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
								{reasoningContent}
							</div>
						)}
					</div>
				)}

				{/* Tool calls (for assistant messages) */}
				{!isUser && toolCalls.length > 0 && (
					<div className="mb-3">
						{toolCalls.map((tool) => (
							<ToolCallDisplay key={tool.id} tool={tool} />
						))}
					</div>
				)}

				{/* Text content */}
				{textContent && (
					<div className="whitespace-pre-wrap text-sm leading-relaxed">
						{renderMarkdown(textContent)}
					</div>
				)}

				{/* Error display */}
				{isAssistantMessage(message.info) && assistantInfo.error && (
					<div className="mt-3 rounded border border-destructive/20 bg-destructive/10 p-2">
						<span className="font-medium text-destructive text-xs">
							{assistantInfo.error.name}
						</span>
						{typeof assistantInfo.error.data?.message === "string" && (
							<p className="mt-1 text-destructive/80 text-xs">
								{assistantInfo.error.data.message}
							</p>
						)}
					</div>
				)}

				{/* Timestamp */}
				{message.info.time.created && (
					<span
						className={`mt-2 block text-xs ${isUser ? "text-background/60" : "text-muted-foreground"}`}
					>
						{new Date(message.info.time.created).toLocaleString()}
					</span>
				)}
			</div>
		</div>
	);
}
