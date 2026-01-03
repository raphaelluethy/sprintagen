/**
 * OpenCode/Agent message and session types
 *
 * Consolidates message types from multiple files into a single source of truth.
 * Re-exports SDK types where appropriate.
 */

import type { Message, Part, ReasoningPart, ToolPart } from "@opencode-ai/sdk";

// Re-export SDK types for convenience
export type { Message, Part, ToolPart, ReasoningPart };

// ============================================================================
// Message Types
// ============================================================================

/**
 * Transformed message format for UI consumption.
 * Normalizes SDK messages into a consistent shape with extracted fields.
 */
export interface TransformedMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	createdAt: Date;
	model?: string;
	toolCalls?: ToolCallInfo[];
	parts: Part[];
	reasoning?: string;
	sessionId?: string;
}

/**
 * Tool call information extracted from message parts
 */
export interface ToolCallInfo {
	toolName: string;
	toolCallId: string;
}

/**
 * OpenCode message as returned by SDK (info + parts)
 */
export interface OpencodeMessage {
	info: Message;
	parts: Part[];
}

/**
 * Alias for TransformedMessage (backwards compatibility)
 * @deprecated Use TransformedMessage directly
 */
export type OpencodeChatMessage = TransformedMessage;

// ============================================================================
// Session Types
// ============================================================================

/**
 * OpenCode session representation
 */
export interface OpencodeSession {
	id: string;
	title?: string;
	status: "idle" | "busy" | "error";
	createdAt: Date;
}

/**
 * Session type for database storage
 */
export type SessionType = "chat" | "ask" | "admin";

/**
 * Session status for database storage
 */
export type SessionStatus = "pending" | "running" | "completed" | "error";

// ============================================================================
// Result Types
// ============================================================================

/**
 * Generic result type for OpenCode operations.
 * Use discriminated union for type-safe error handling.
 */
export type OpencodeResult<T> =
	| { success: true; data: T }
	| { success: false; error: string };

/**
 * Result of fetching messages for a session
 */
export interface OpencodeMessagesResult {
	messages: TransformedMessage[];
	currentSessionId: string;
	isNewSession: boolean;
}

/**
 * Result of sending a message
 */
export interface OpencodeMessageResult {
	message: TransformedMessage;
	sessionId: string;
	isNewSession: boolean;
}

/**
 * Result of asking a question
 */
export interface OpencodeQuestionResult {
	answer: string;
	sessionId: string;
	isNewSession: boolean;
}

// ============================================================================
// Tool State Types (for UI rendering)
// ============================================================================

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
	time: { start: number };
}

export interface ToolStateCompleted {
	status: "completed";
	input: Record<string, unknown>;
	output: string;
	title: string;
	metadata: Record<string, unknown>;
	time: { start: number; end: number; compacted?: number };
}

export interface ToolStateError {
	status: "error";
	input: Record<string, unknown>;
	error: string;
	metadata?: Record<string, unknown>;
	time: { start: number; end: number };
}

export type ToolState =
	| ToolStatePending
	| ToolStateRunning
	| ToolStateCompleted
	| ToolStateError;

// ============================================================================
// Token/Cost Types
// ============================================================================

export interface TokenUsage {
	input: number;
	output: number;
	reasoning: number;
	cache: {
		read: number;
		write: number;
	};
}
