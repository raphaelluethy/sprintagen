/**
 * Centralized type definitions for Sprintagen
 *
 * Import all shared types from this module:
 * @example
 * ```typescript
 * import type { Ticket, TicketWithRelations, RankingResult } from "@/types";
 * import type { AgentProvider, AgentMessage } from "@/types";
 * ```
 */

// Agent provider types
export type {
	AgentCapabilities,
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
	SessionDiffItem,
	SessionStatusInfo,
	SessionTodoItem,
} from "./ai-agent";

// OpenCode/Message types
export type {
	Message,
	OpencodeChatMessage,
	OpencodeMessage,
	OpencodeMessageResult,
	OpencodeMessagesResult,
	OpencodeQuestionResult,
	OpencodeResult,
	OpencodeSession,
	Part,
	ReasoningPart,
	SessionStatus,
	SessionType,
	TokenUsage,
	ToolCallInfo,
	ToolPart,
	ToolState,
	ToolStateCompleted,
	ToolStateError,
	ToolStatePending,
	ToolStateRunning,
	TransformedMessage,
} from "./opencode";
// Ticket types
export type {
	OpencodeSessionMetadata,
	RankingInput,
	RankingResult,
	Ticket,
	TicketMessage,
	TicketMetadata,
	TicketRanking,
	TicketRecommendation,
	TicketWithRankings,
	TicketWithRecommendations,
	TicketWithRelations,
} from "./ticket";
