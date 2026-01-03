/**
 * AI Agent Provider interfaces
 *
 * Defines the strategy pattern interfaces for AI agent providers.
 * Supports single active agent mode with pluggable implementations.
 */

import type { ToolPart } from "@opencode-ai/sdk";
import type { ToolCallInfo } from "./opencode";

// ============================================================================
// Core Agent Interfaces
// ============================================================================

/**
 * Normalized message format for agent communication.
 * All agent providers must transform their messages to this format.
 */
export interface AgentMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: Date;
	metadata?: {
		model?: string;
		toolCalls?: ToolCallInfo[];
		reasoning?: string;
	};
}

/**
 * Agent session representation.
 * Tracks the state of an ongoing agent conversation.
 */
export interface AgentSession {
	id: string;
	title?: string;
	status: "idle" | "busy" | "error";
	createdAt: Date;
}

/**
 * Options for sending messages to an agent
 */
export interface SendMessageOptions {
	/** Model selection override */
	model?: ModelSelection;
	/** Whether to wait for completion */
	stream?: boolean;
	/** Context/system prompt */
	context?: string;
}

/**
 * Model selection configuration
 */
export interface ModelSelection {
	providerId: string;
	modelId: string;
}

// ============================================================================
// Agent Capabilities
// ============================================================================

/**
 * Capabilities that an agent provider may support.
 * Used to conditionally enable features in the UI and backend.
 */
export interface AgentCapabilities {
	/** Supports session status tracking (idle/busy/error) */
	sessionStatus: boolean;
	/** Supports extracting tool call information */
	toolCalls: boolean;
	/** Supports session diff (code changes tracking) */
	sessionDiff: boolean;
	/** Supports session todos (task tracking) */
	sessionTodos: boolean;
	/** Supports async/fire-and-forget prompts */
	asyncPrompts: boolean;
	/** Supports subagent/task delegation */
	subagents: boolean;
}

/**
 * Session status info returned by providers that support status tracking
 */
export interface SessionStatusInfo {
	type: "idle" | "busy" | "retry";
	error?: string;
}

/**
 * Session diff item for tracking code changes
 */
export interface SessionDiffItem {
	path: string;
	status: "added" | "modified" | "deleted";
	diff?: string;
}

/**
 * Session todo item for tracking tasks
 */
export interface SessionTodoItem {
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed";
}

// ============================================================================
// Agent Provider Interface
// ============================================================================

/**
 * Core interface that all agent providers must implement.
 *
 * @example
 * ```typescript
 * class OpencodeProvider implements AgentProvider {
 *   readonly name = "opencode";
 *   // ... implementation
 * }
 * ```
 */
export interface AgentProvider {
	/** Unique identifier for this provider */
	readonly name: string;

	// Health & Configuration
	/** Check if provider is properly configured */
	isConfigured(): boolean;
	/** Verify provider connectivity */
	checkHealth(): Promise<boolean>;

	// Capabilities
	/** Declare what capabilities this provider supports */
	getCapabilities(): AgentCapabilities;

	// Session Management
	/** Create a new conversation session */
	createSession(title?: string): Promise<AgentSession>;
	/** Get an existing session by ID */
	getSession(sessionId: string): Promise<AgentSession | null>;
	/** List all available sessions */
	listSessions(): Promise<AgentSession[]>;

	// Messaging
	/** Send a message and get a response */
	sendMessage(
		sessionId: string,
		message: string,
		options?: SendMessageOptions,
	): Promise<AgentMessage>;
	/** Get all messages in a session */
	getMessages(sessionId: string): Promise<AgentMessage[]>;

	// Real-time Support (optional capability)
	/** Whether this provider supports SSE streaming */
	supportsStreaming(): boolean;
	/** Get SSE endpoint URL for real-time updates */
	getEventSourceUrl?(sessionId: string): string;

	// Extended Capabilities (optional - check getCapabilities() before calling)
	/** Get session status (requires sessionStatus capability) */
	getSessionStatus?(sessionId: string): Promise<SessionStatusInfo>;
	/** Get all session statuses (requires sessionStatus capability) */
	getAllSessionStatuses?(): Promise<Record<string, SessionStatusInfo>>;
	/** Get tool calls for a session (requires toolCalls capability) */
	getToolCalls?(sessionId: string): Promise<ToolPart[]>;
	/** Get session diff (requires sessionDiff capability) */
	getSessionDiff?(sessionId: string): Promise<SessionDiffItem[]>;
	/** Get session todos (requires sessionTodos capability) */
	getSessionTodos?(sessionId: string): Promise<SessionTodoItem[]>;
	/** Send async prompt without waiting (requires asyncPrompts capability) */
	sendMessageAsync?(
		sessionId: string,
		message: string,
		options?: SendMessageOptions,
	): Promise<void>;
}

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Configuration for agent registry
 */
export interface AgentRegistryConfig {
	/** Default provider to use if none specified */
	defaultProvider: string;
	/** Available providers */
	providers: string[];
}

/**
 * Events emitted by agent registry
 */
export type AgentRegistryEvent =
	| { type: "provider-registered"; name: string }
	| { type: "provider-activated"; name: string }
	| { type: "provider-error"; name: string; error: Error };

// ============================================================================
// Model Selector Types
// ============================================================================

/**
 * Available model tiers for automatic selection
 */
export type ModelTier = "fast" | "standard" | "premium";

/**
 * Model selector configuration
 */
export interface ModelSelectorConfig {
	/** Use fast mode (cheaper, faster models) */
	fastMode: boolean;
	/** Override to specific model */
	override?: ModelSelection;
}

/**
 * Get default model based on configuration
 */
export interface ModelSelector {
	getDefault(config?: ModelSelectorConfig): ModelSelection;
	getForTier(tier: ModelTier): ModelSelection;
}
