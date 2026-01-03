/**
 * Ticket-related type definitions
 *
 * Centralizes all ticket types to avoid duplication across components.
 * Uses Drizzle's $inferSelect for type-safe database row types.
 */

import type {
	ticketMessages,
	ticketRankings,
	ticketRecommendations,
	tickets,
} from "@/server/db/schema";

// ============================================================================
// Base Types (inferred from schema)
// ============================================================================

/** Base ticket type inferred from database schema */
export type Ticket = typeof tickets.$inferSelect;

/** Ticket recommendation from AI analysis */
export type TicketRecommendation = typeof ticketRecommendations.$inferSelect;

/** AI-generated ranking scores for a ticket */
export type TicketRanking = typeof ticketRankings.$inferSelect;

/** Message in ticket conversation history */
export type TicketMessage = typeof ticketMessages.$inferSelect;

// ============================================================================
// Metadata Types (strongly typed)
// ============================================================================

/**
 * Strongly-typed metadata for tickets.
 * Replaces `Record<string, unknown>` in schema for type safety.
 */
export interface TicketMetadata {
	/** OpenCode session ID if ticket has an active agent session */
	opencodeSessionId?: string;
	/** External URL (e.g., Jira or Linear link) */
	externalUrl?: string;
	/** Jira-specific issue type */
	jiraIssueType?: string;
	/** Linear-specific project ID */
	linearProjectId?: string;
	/** Docker container ID for Docker provider */
	dockerContainerId?: string;
	/** Allow additional provider-specific fields */
	[key: string]: unknown;
}

/**
 * Strongly-typed metadata for OpenCode sessions.
 */
export interface OpencodeSessionMetadata {
	/** The prompt used to start the session */
	prompt?: string;
	/** Ticket title at session creation time */
	ticketTitle?: string;
	/** Model configuration */
	model?: {
		providerId: string;
		modelId: string;
	};
	/** Allow additional fields */
	[key: string]: unknown;
}

// ============================================================================
// Composite Types (with relations)
// ============================================================================

/**
 * Ticket with all related data loaded.
 * Use this type when querying tickets with `.with()` relations.
 */
export type TicketWithRelations = Ticket & {
	recommendations?: TicketRecommendation[];
	rankings?: TicketRanking[];
	messages?: TicketMessage[];
};

/**
 * Ticket with recommendations only (common query pattern)
 */
export type TicketWithRecommendations = Ticket & {
	recommendations?: TicketRecommendation[];
};

/**
 * Ticket with rankings only (for sorted lists)
 */
export type TicketWithRankings = Ticket & {
	rankings?: TicketRanking[];
};

// ============================================================================
// Ranking Types
// ============================================================================

/**
 * Result from AI ranking procedure.
 * Exported from inline definition in ticket router.
 */
export interface RankingResult {
	ticketId: string;
	urgencyScore: number;
	impactScore: number;
	complexityScore: number;
	overallScore: number;
	reasoning: string;
}

/**
 * Input for ranking multiple tickets
 */
export interface RankingInput {
	ticketIds: string[];
	criteria?: {
		prioritizeUrgency?: boolean;
		prioritizeImpact?: boolean;
		prioritizeComplexity?: boolean;
	};
}
