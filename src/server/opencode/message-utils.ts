import type { Message, Part, ToolPart } from "@opencode-ai/sdk";

export interface TransformedMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	createdAt: Date;
	model?: string;
	toolCalls?: { toolName: string; toolCallId: string }[];
	parts: Part[]; // Always included, even if empty
	reasoning?: string;
	sessionId?: string;
}

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

export function extractToolCalls(
	parts: Part[],
): { toolName: string; toolCallId: string }[] {
	return parts
		.filter((part): part is ToolPart => part.type === "tool")
		.map((part) => ({ toolName: part.tool, toolCallId: part.callID }));
}

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

export function getCreatedAt(message: Message): Date {
	const time =
		(message as { time?: { created?: number; completed?: number } }).time ?? {};
	const timestamp = time.created ?? time.completed ?? Date.now();
	return new Date(timestamp);
}

export function getCurrentToolCalls(parts: Part[]): ToolPart[] {
	return parts.filter(
		(part): part is ToolPart =>
			part.type === "tool" &&
			(part.state.status === "pending" || part.state.status === "running"),
	);
}

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
		parts: parts, // Always include parts array, even if empty
		reasoning: reasoning || undefined,
		sessionId: info.sessionID,
	};
}
