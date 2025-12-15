import type { MessagePart } from "@/server/tickets/opencode";

export interface OpencodeChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	createdAt: Date;
	model?: string;
	toolCalls?: { toolName: string; toolCallId: string }[];
	parts?: MessagePart[];
	reasoning?: string;
	sessionId?: string;
}
