// Re-export SDK types for convenience
export type {
	Session,
	Message,
	Part,
	ToolPart,
	Event,
	TextPart,
	FilePart,
} from "@opencode-ai/sdk";

// Local state shape
export interface OpencodeState {
	sessions: Session[];
	messages: Record<string, Message[]>;
	parts: Record<string, Part[]>;
	sessionStatus: Record<string, "idle" | "running" | "error">;
}

// Re-export common types from SDK
import type { Session, Message, Part } from "@opencode-ai/sdk";
