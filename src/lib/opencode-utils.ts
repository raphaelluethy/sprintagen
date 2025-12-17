/**
 * Utility functions for working with OpenCode SDK types.
 * These helpers extract specific content from message parts.
 */
import type { Message, Part, ToolPart } from "@opencode-ai/sdk";

/**
 * Message with parts combined - common structure for UI display
 */
export interface MessageWithParts {
	info: Message;
	parts: Part[];
}

/**
 * Tool state types for the ToolPart state field
 */
export interface ToolStatePending {
	status: "pending";
	input: Record<string, unknown>;
	raw: string;
}

export interface ToolStateRunning {
	status: "running";
	input: Record<string, unknown>;
	title?: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
	};
}

export interface ToolStateCompleted {
	status: "completed";
	input: Record<string, unknown>;
	output: string;
	title: string;
	metadata: Record<string, unknown>;
	time: {
		start: number;
		end: number;
		compacted?: number;
	};
}

export interface ToolStateError {
	status: "error";
	input: Record<string, unknown>;
	error: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
		end: number;
	};
}

export type ToolState =
	| ToolStatePending
	| ToolStateRunning
	| ToolStateCompleted
	| ToolStateError;

/**
 * Extract text content from message parts
 */
export function getTextContent(parts: Part[]): string {
	return parts
		.filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
		.map((p) => p.text)
		.join("")
		.trim();
}

/**
 * Extract reasoning content from message parts
 */
export function getReasoningContent(parts: Part[]): string {
	return parts
		.filter(
			(p): p is Extract<Part, { type: "reasoning" }> => p.type === "reasoning",
		)
		.map((p) => p.text)
		.join("")
		.trim();
}

/**
 * Extract tool calls from message parts
 */
export function getToolCalls(parts: Part[]): ToolPart[] {
	return parts.filter((p): p is ToolPart => p.type === "tool");
}

/**
 * Get tool title based on state
 */
export function getToolTitle(state: ToolState): string | undefined {
	if (state.status === "completed" || state.status === "running") {
		return state.title;
	}
	return undefined;
}

/**
 * Get tool output (or error message)
 */
export function getToolOutput(state: ToolState): string | undefined {
	if (state.status === "completed") {
		return state.output;
	}
	if (state.status === "error") {
		return state.error;
	}
	return undefined;
}

/**
 * Get tool preview from metadata
 */
export function getToolPreview(state: ToolState): string | undefined {
	if (state.status === "completed" && state.metadata?.preview) {
		return state.metadata.preview as string;
	}
	return undefined;
}

/**
 * Check if message is from user
 */
export function isUserMessage(info: Message): boolean {
	return info.role === "user";
}

/**
 * Check if message is from assistant
 */
export function isAssistantMessage(info: Message): boolean {
	return info.role === "assistant";
}
