/**
 * OpenCode Ticket Service
 *
 * Unified service that wraps AgentRegistry for ticket-specific OpenCode operations.
 * Maintains the ticket-session relationship while using the new AgentRegistry pattern.
 */

import { eq } from "drizzle-orm";
import { agentRegistry } from "@/server/ai-agents";
import { db } from "@/server/db";
import { tickets } from "@/server/db/schema";
import type { AgentMessage, SessionStatusInfo } from "@/types/ai-agent";

// ============================================================================
// Types
// ============================================================================

interface TicketMetadata {
	opencodeSessionId?: string;
	[key: string]: unknown;
}

export interface MessageResult {
	message: AgentMessage;
	sessionId: string;
	isNewSession: boolean;
}

export interface ChatResult {
	messages: AgentMessage[];
	currentSessionId: string | null;
	status: SessionStatusInfo;
	isNewSession: boolean;
}

export interface SessionStatus {
	status: SessionStatusInfo;
	sessionId: string;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class OpencodeTicketService {
	/**
	 * Start a new session for a ticket
	 */
	async startSession(
		ticketId: string,
		sessionType: "chat" | "ask" | "admin",
	): Promise<{ sessionId: string }> {
		const ticket = await db.query.tickets.findFirst({
			where: eq(tickets.id, ticketId),
		});

		if (!ticket) {
			throw new Error(`Ticket not found: ${ticketId}`);
		}

		const provider = agentRegistry.getActive();
		const session = await provider.createSession(
			`${sessionType}: ${ticket.title} (${ticketId})`,
		);

		// Update ticket metadata with new session ID
		const metadata = (ticket.metadata ?? {}) as TicketMetadata;
		await db
			.update(tickets)
			.set({
				metadata: {
					...metadata,
					opencodeSessionId: session.id,
				},
			})
			.where(eq(tickets.id, ticketId));

		console.log(
			`[OpencodeTicketService] Started ${sessionType} session ${session.id} for ticket ${ticketId}`,
		);

		return { sessionId: session.id };
	}

	/**
	 * Send a message to a ticket's active session (creates session if needed)
	 */
	async sendMessage(
		ticketId: string,
		sessionId: string | undefined,
		message: string,
	): Promise<MessageResult> {
		let resolvedSessionId: string;
		let isNewSession = false;

		if (sessionId) {
			// Use provided session ID
			resolvedSessionId = sessionId;
		} else {
			// Get or create session
			const result = await this.getOrCreateSession(ticketId);
			resolvedSessionId = result.sessionId;
			isNewSession = result.isNew;
		}

		const provider = agentRegistry.getActive();

		// Prefer async if available, otherwise use sync
		if (provider.sendMessageAsync) {
			await provider.sendMessageAsync(resolvedSessionId, message);

			// For async, we need to return a placeholder message
			// The actual response will come via SSE
			return {
				message: {
					id: crypto.randomUUID(),
					role: "user",
					content: message,
					createdAt: new Date(),
				},
				sessionId: resolvedSessionId,
				isNewSession,
			};
		}

		const response = await provider.sendMessage(resolvedSessionId, message);

		return {
			message: response,
			sessionId: resolvedSessionId,
			isNewSession,
		};
	}

	/**
	 * Get chat messages for a ticket's active session
	 */
	async getChat(ticketId: string, sessionId?: string): Promise<ChatResult> {
		let resolvedSessionId: string | null = sessionId ?? null;
		const isNewSession = false;

		if (!resolvedSessionId) {
			// Look up session from ticket metadata
			const ticket = await db.query.tickets.findFirst({
				where: eq(tickets.id, ticketId),
			});

			if (!ticket) {
				throw new Error(`Ticket not found: ${ticketId}`);
			}

			const metadata = (ticket.metadata ?? {}) as TicketMetadata;
			resolvedSessionId = metadata.opencodeSessionId ?? null;
		}

		if (!resolvedSessionId) {
			// No session exists, return empty result
			return {
				messages: [],
				currentSessionId: null,
				status: { type: "idle" },
				isNewSession: false,
			};
		}

		const provider = agentRegistry.getActive();

		// Verify session exists
		const session = await provider.getSession(resolvedSessionId);
		if (!session) {
			// Session doesn't exist (possibly deleted), clear from ticket
			await this.clearStaleSessionId(ticketId);
			return {
				messages: [],
				currentSessionId: null,
				status: { type: "idle" },
				isNewSession: false,
			};
		}

		// Get messages
		const messages = await provider.getMessages(resolvedSessionId);

		// Get status if supported
		let status: SessionStatusInfo = { type: "idle" };
		if (provider.getSessionStatus) {
			status = await provider.getSessionStatus(resolvedSessionId);
		}

		return {
			messages,
			currentSessionId: resolvedSessionId,
			status,
			isNewSession,
		};
	}

	/**
	 * Get the status of a session
	 */
	async getStatus(sessionId: string): Promise<SessionStatus> {
		const provider = agentRegistry.getActive();

		let status: SessionStatusInfo = { type: "idle" };
		if (provider.getSessionStatus) {
			status = await provider.getSessionStatus(sessionId);
		}

		return {
			status,
			sessionId,
		};
	}

	/**
	 * Get or create session for a ticket
	 */
	async getOrCreateSession(
		ticketId: string,
	): Promise<{ sessionId: string; isNew: boolean }> {
		const ticket = await db.query.tickets.findFirst({
			where: eq(tickets.id, ticketId),
		});

		if (!ticket) {
			throw new Error(`Ticket not found: ${ticketId}`);
		}

		const metadata = (ticket.metadata ?? {}) as TicketMetadata;

		// Check if we have an existing session
		if (metadata.opencodeSessionId) {
			const provider = agentRegistry.getActive();
			const session = await provider.getSession(metadata.opencodeSessionId);

			if (session) {
				console.log(
					`[OpencodeTicketService] Reusing session ${metadata.opencodeSessionId} for ticket ${ticketId}`,
				);
				return { sessionId: metadata.opencodeSessionId, isNew: false };
			}

			// Session doesn't exist anymore, clear stale ID
			console.log(
				`[OpencodeTicketService] Session ${metadata.opencodeSessionId} is stale, creating new one`,
			);
			await this.clearStaleSessionId(ticketId);
		}

		// Create new session
		const { sessionId } = await this.startSession(ticketId, "chat");
		return { sessionId, isNew: true };
	}

	/**
	 * Clear stale session ID from ticket metadata
	 */
	private async clearStaleSessionId(ticketId: string): Promise<void> {
		const ticket = await db.query.tickets.findFirst({
			where: eq(tickets.id, ticketId),
		});

		if (!ticket) return;

		const metadata = (ticket.metadata ?? {}) as TicketMetadata;
		const { opencodeSessionId: _, ...rest } = metadata;

		await db
			.update(tickets)
			.set({ metadata: rest })
			.where(eq(tickets.id, ticketId));

		console.log(
			`[OpencodeTicketService] Cleared stale session ID for ticket ${ticketId}`,
		);
	}
}

// ============================================================================
// Singleton Export
// ============================================================================

export const opencodeTicketService = new OpencodeTicketService();
