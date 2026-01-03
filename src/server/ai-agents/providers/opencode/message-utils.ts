/**
 * OpenCode Message Utilities
 *
 * Transforms SDK messages into normalized format for UI consumption.
 * Moved from src/server/opencode/message-utils.ts to consolidate agent code.
 */

import type { Message, Part, ToolPart } from "@opencode-ai/sdk";
import type { ToolCallInfo, TransformedMessage } from "@/types";

/**
 * Extract text content from message parts
 *
 * Combines text parts, file parts, and step-finish reasons into a single string.
 *
 * @param parts - Array of message parts from SDK
 * @returns Combined text content
 */
export function extractTextFromParts(parts: Part[]): string {
	const textParts = parts
		.filter(
			(part): part is Extract<Part, { type: "text" }> => part.type === "text",
		)
		.map((part) => part.text);

	const stepFinishParts = parts
		.filter(
			(part): part is Extract<Part, { type: "step-finish" }> =>
				part.type === "step-finish",
		)
		.map((part) => part.reason);

	const fileParts = parts
		.filter(
			(part): part is Extract<Part, { type: "file" }> => part.type === "file",
		)
		.map((part) => {
			const p = part as { content?: string; data?: string; mimeType?: string };
			const content = p.content ?? p.data ?? "";
			const mimeType = p.mimeType ?? "application/octet-stream";
			return `[File: ${mimeType}]\n${content}`;
		});

	return [...textParts, ...fileParts, ...stepFinishParts].join("\n");
}

/**
 * Extract reasoning content from message parts
 *
 * @param parts - Array of message parts from SDK
 * @returns Combined reasoning text
 */
export function extractReasoningFromParts(parts: Part[]): string {
	return parts
		.filter(
			(part): part is Extract<Part, { type: "reasoning" }> =>
				part.type === "reasoning",
		)
		.map((part) => part.text)
		.join("\n")
		.trim();
}

/**
 * Extract tool call information from message parts
 *
 * @param parts - Array of message parts from SDK
 * @returns Array of tool call info objects
 */
export function extractToolCalls(parts: Part[]): ToolCallInfo[] {
	return parts
		.filter((part): part is ToolPart => part.type === "tool")
		.map((part) => ({ toolName: part.tool, toolCallId: part.callID }));
}

/**
 * Get formatted model label from message
 *
 * @param message - SDK message object
 * @returns Model label like "opencode/minimax-m2.1-free" or undefined
 */
export function getModelLabel(message: Message): string | undefined {
	if ("model" in message && message.model) {
		const model = message.model as { providerID?: string; modelID?: string };
		if (model.providerID && model.modelID) {
			return `${model.providerID}/${model.modelID}`;
		}
	}

	if ("providerID" in message && "modelID" in message) {
		return `${message.providerID}/${message.modelID}`;
	}

	return undefined;
}

/**
 * Get creation timestamp from message
 *
 * @param message - SDK message object
 * @returns Date object representing creation time
 */
export function getCreatedAt(message: Message): Date {
	const time =
		(message as { time?: { created?: number; completed?: number } }).time ?? {};
	const timestamp = time.created ?? time.completed ?? Date.now();
	return new Date(timestamp);
}

/**
 * Get currently running or pending tool calls
 *
 * @param parts - Array of message parts from SDK
 * @returns Array of tool parts that are pending or running
 */
export function getCurrentToolCalls(parts: Part[]): ToolPart[] {
	return parts.filter(
		(part): part is ToolPart =>
			part.type === "tool" &&
			(part.state.status === "pending" || part.state.status === "running"),
	);
}

/**
 * Transform SDK message into normalized UI format
 *
 * @param info - Message info from SDK
 * @param parts - Message parts from SDK
 * @returns Transformed message for UI consumption
 *
 * @example
 * ```typescript
 * const result = await client.session.messages({ path: { id: sessionId } });
 * const messages = result.data.map(msg => transformMessage(msg.info, msg.parts));
 * ```
 */
export function transformMessage(
	info: Message,
	parts: Part[],
): TransformedMessage {
	const reasoning = extractReasoningFromParts(parts);

	return {
		id: info.id,
		role: info.role,
		text: extractTextFromParts(parts),
		createdAt: getCreatedAt(info),
		model: getModelLabel(info),
		toolCalls: extractToolCalls(parts),
		parts: parts,
		reasoning: reasoning || undefined,
		sessionId: info.sessionID,
	};
}
