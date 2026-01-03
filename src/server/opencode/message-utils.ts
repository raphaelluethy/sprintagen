/**
 * OpenCode Message Utilities
 *
 * Re-exports from the consolidated ai-agents module for backwards compatibility.
 * @deprecated Import from "@/server/ai-agents" instead.
 */

export {
	extractReasoningFromParts,
	extractTextFromParts,
	extractToolCalls,
	getCreatedAt,
	getCurrentToolCalls,
	getModelLabel,
	transformMessage,
} from "@/server/ai-agents/providers/opencode/message-utils";

export type { TransformedMessage } from "@/types";
