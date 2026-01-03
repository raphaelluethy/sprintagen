/**
 * AI Agents Module
 *
 * Provides a strategy pattern for AI agent providers.
 * Supports single active agent mode with pluggable implementations.
 *
 * @example
 * ```typescript
 * import { agentRegistry, OpencodeProvider, MockAgentProvider } from "@/server/ai-agents";
 *
 * // Register providers
 * agentRegistry.register(new OpencodeProvider());
 * agentRegistry.register(new MockAgentProvider());
 *
 * // Use active provider
 * const provider = agentRegistry.getActive();
 * const session = await provider.createSession("My Chat");
 * const response = await provider.sendMessage(session.id, "Hello!");
 * ```
 */

export {
	formatModelLabel,
	getDefaultModel,
	getModelForTier,
	isFastMode,
} from "./model-selector";
export { MockAgentProvider } from "./providers/mock";

// Provider exports
export { OpencodeProvider } from "./providers/opencode";
export {
	getOpencodeClient,
	resetOpencodeClient,
} from "./providers/opencode/client";
export {
	extractReasoningFromParts,
	extractTextFromParts,
	extractToolCalls,
	getCreatedAt,
	getCurrentToolCalls,
	getModelLabel,
	transformMessage,
} from "./providers/opencode/message-utils";
// Core exports
export { AgentRegistry, agentRegistry } from "./registry";

// Type exports
export type {
	AgentMessage,
	AgentProvider,
	AgentRegistryConfig,
	AgentRegistryEvent,
	AgentSession,
	ModelSelection,
	ModelSelector,
	ModelSelectorConfig,
	ModelTier,
	SendMessageOptions,
} from "./types";
