/**
 * OpenCode tRPC Router
 *
 * Handles all OpenCode operations including session management,
 * message handling, and real-time updates.
 */

import type { Message, Part, Session, ToolPart } from "@opencode-ai/sdk";
import { TRPCError } from "@trpc/server";
import dedent from "dedent";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { getOpencodeClient } from "@/lib/opencode-client";
import { startEventListener } from "@/lib/opencode-event-listener";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { tickets } from "@/server/db/schema";
import {
	getOpencodeStore,
	type StoredSessionState,
} from "@/server/redis/opencode-store";

// Start the event listener when this module loads
// This ensures we're always listening for OpenCode events
startEventListener().catch((err) => {
	console.error("[OPENCODE-ROUTER] Failed to start event listener:", err);
});

/**
 * Helper to extract text from message parts
 */
function extractTextFromParts(parts: Part[]): string {
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

	return [...textParts, ...stepFinishParts].join("\n");
}

/**
 * Helper to extract reasoning from message parts
 */
function extractReasoningFromParts(parts: Part[]): string {
	return parts
		.filter(
			(part): part is Extract<Part, { type: "reasoning" }> =>
				part.type === "reasoning",
		)
		.map((part) => part.text)
		.join("\n")
		.trim();
}

/**
 * Helper to extract tool calls from message parts
 */
function extractToolCalls(
	parts: Part[],
): { toolName: string; toolCallId: string }[] {
	return parts
		.filter((part): part is ToolPart => part.type === "tool")
		.map((part) => ({ toolName: part.tool, toolCallId: part.callID }));
}

/**
 * Helper to get model label from message
 */
function getModelLabel(message: Message): string | undefined {
	if ("providerID" in message && "modelID" in message) {
		return `${message.providerID}/${message.modelID}`;
	}
	return undefined;
}

/**
 * Transform SDK message to chat message format
 */
function transformMessage(info: Message, parts: Part[]) {
	const time = info.time as { created?: number; completed?: number };
	const reasoning = extractReasoningFromParts(parts);

	return {
		id: info.id,
		role: info.role,
		text: extractTextFromParts(parts),
		createdAt: new Date(time.created ?? Date.now()),
		model: getModelLabel(info),
		toolCalls: extractToolCalls(parts),
		parts: parts.length > 0 ? parts : undefined,
		reasoning: reasoning || undefined,
		sessionId: info.sessionID,
	};
}

/**
 * Helper to get current tool calls from parts
 */
function getCurrentToolCalls(parts: Part[]): ToolPart[] {
	return parts.filter(
		(part): part is ToolPart =>
			part.type === "tool" &&
			(part.state.status === "pending" || part.state.status === "running"),
	);
}

export const opencodeRouter = createTRPCRouter({
	// ========================================================================
	// Health & Status
	// ========================================================================

	/**
	 * Check if OpenCode server is available
	 */
	health: publicProcedure.query(async () => {
		try {
			const client = getOpencodeClient();
			const result = await client.app.agents();
			return { available: Boolean(result.data) };
		} catch {
			return { available: false };
		}
	}),

	/**
	 * Get available agents
	 */
	getAgents: publicProcedure.query(async () => {
		const client = getOpencodeClient();
		const result = await client.app.agents();

		if (!result.data) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch agents",
			});
		}

		return result.data;
	}),

	/**
	 * Get available providers
	 */
	getProviders: publicProcedure.query(async () => {
		const client = getOpencodeClient();
		const result = await client.config.providers();

		if (!result.data) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch providers",
			});
		}

		return result.data;
	}),

	// ========================================================================
	// Session Management
	// ========================================================================

	/**
	 * List all sessions
	 */
	listSessions: publicProcedure.query(async () => {
		const client = getOpencodeClient();
		const result = await client.session.list();

		if (!result.data) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to list sessions",
			});
		}

		return result.data;
	}),

	/**
	 * Get session by ID
	 */
	getSession: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const client = getOpencodeClient();
			const result = await client.session.get({ path: { id: input.id } });

			if (!result.data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Session not found",
				});
			}

			return result.data;
		}),

	/**
	 * Get session status
	 */
	getSessionStatus: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			// First check Redis store
			const store = getOpencodeStore();
			const status = await store.getStatus(input.id);
			if (status) {
				return status;
			}

			// Fall back to SDK
			const client = getOpencodeClient();
			const result = await client.session.status();

			if (!result.data) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get session status",
				});
			}

			return result.data[input.id] ?? { type: "idle" };
		}),

	/**
	 * Get all session statuses
	 */
	getAllSessionStatus: publicProcedure.query(async () => {
		const client = getOpencodeClient();
		const result = await client.session.status();

		if (!result.data) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to get session statuses",
			});
		}

		return result.data;
	}),

	/**
	 * Get session diff
	 */
	getSessionDiff: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			// First check Redis store
			const store = getOpencodeStore();
			const diff = await store.getDiff(input.id);
			if (diff.length > 0) {
				return diff;
			}

			// Fall back to SDK
			const client = getOpencodeClient();
			const result = await client.session.diff({ path: { id: input.id } });

			if (!result.data) {
				return [];
			}

			return result.data;
		}),

	/**
	 * Get session todos
	 */
	getSessionTodos: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			// First check Redis store
			const store = getOpencodeStore();
			const todos = await store.getTodos(input.id);
			if (todos.length > 0) {
				return todos;
			}

			// Fall back to SDK
			const client = getOpencodeClient();
			const result = await client.session.todo({ path: { id: input.id } });

			if (!result.data) {
				return [];
			}

			return result.data;
		}),

	// ========================================================================
	// Messages
	// ========================================================================

	/**
	 * Get messages for a session
	 */
	getMessages: publicProcedure
		.input(z.object({ sessionId: z.string() }))
		.query(async ({ input }) => {
			// First check Redis store
			const store = getOpencodeStore();
			const storedMessages = await store.getMessages(input.sessionId);

			if (storedMessages.length > 0) {
				// Get parts for each message
				const messagesWithParts = await Promise.all(
					storedMessages.map(async (info) => {
						const parts = await store.getParts(info.id);
						return transformMessage(info, parts);
					}),
				);
				return messagesWithParts;
			}

			// Fall back to SDK
			const client = getOpencodeClient();
			const result = await client.session.messages({
				path: { id: input.sessionId },
			});

			if (!result.data) {
				return [];
			}

			// Transform messages
			return result.data.map((msg) => transformMessage(msg.info, msg.parts));
		}),

	/**
	 * Get parts for a message
	 */
	getMessageParts: publicProcedure
		.input(z.object({ messageId: z.string() }))
		.query(async ({ input }) => {
			const store = getOpencodeStore();
			return store.getParts(input.messageId);
		}),

	/**
	 * Get full session data (for initial load)
	 */
	getFullSession: publicProcedure
		.input(z.object({ sessionId: z.string() }))
		.query(async ({ input }) => {
			// Try to get from Redis first
			const store = getOpencodeStore();
			const trackedSession = await store.getTrackedSession(input.sessionId);

			if (trackedSession) {
				const storedMessages = await store.getMessages(input.sessionId);
				const messagesWithParts = await Promise.all(
					storedMessages.map(async (info) => {
						const parts = await store.getParts(info.id);
						return { info, parts };
					}),
				);

				const status = await store.getStatus(input.sessionId);
				const diff = await store.getDiff(input.sessionId);
				const todos = await store.getTodos(input.sessionId);

				// Get all tool calls
				const allParts = messagesWithParts.flatMap((m) => m.parts);
				const toolCalls = getCurrentToolCalls(allParts);

				return {
					session: trackedSession.session,
					messages: messagesWithParts.map((m) =>
						transformMessage(m.info, m.parts),
					),
					status: status ?? { type: "idle" as const },
					diff,
					todos,
					toolCalls,
					ticketId: trackedSession.ticketId,
					sessionType: trackedSession.sessionType,
				};
			}

			// Fall back to SDK
			const client = getOpencodeClient();
			const [
				sessionResult,
				messagesResult,
				statusResult,
				diffResult,
				todoResult,
			] = await Promise.all([
				client.session.get({ path: { id: input.sessionId } }),
				client.session.messages({ path: { id: input.sessionId } }),
				client.session.status(),
				client.session.diff({ path: { id: input.sessionId } }),
				client.session.todo({ path: { id: input.sessionId } }),
			]);

			if (!sessionResult.data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Session not found",
				});
			}

			const messages = (messagesResult.data ?? []).map((m) =>
				transformMessage(m.info, m.parts),
			);

			const allParts = (messagesResult.data ?? []).flatMap((m) => m.parts);
			const toolCalls = getCurrentToolCalls(allParts);

			return {
				session: sessionResult.data,
				messages,
				status: statusResult.data?.[input.sessionId] ?? {
					type: "idle" as const,
				},
				diff: diffResult.data ?? [],
				todos: todoResult.data ?? [],
				toolCalls,
			};
		}),

	// ========================================================================
	// Session Actions
	// ========================================================================

	/**
	 * Create a new session
	 */
	createSession: publicProcedure
		.input(
			z.object({
				title: z.string().optional(),
				ticketId: z.string().optional(),
				sessionType: z.enum(["chat", "ask", "admin"]).default("chat"),
			}),
		)
		.mutation(async ({ input }) => {
			const client = getOpencodeClient();
			const result = await client.session.create({
				body: { title: input.title ?? "New Session" },
			});

			if (!result.data) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create session",
				});
			}

			const session = result.data as Session;

			// Track session in Redis
			const store = getOpencodeStore();
			await store.createTrackedSession(session, {
				ticketId: input.ticketId,
				sessionType: input.sessionType,
			});

			return session;
		}),

	/**
	 * Send a prompt to a session
	 */
	sendPrompt: publicProcedure
		.input(
			z.object({
				sessionId: z.string(),
				message: z.string().min(1),
				agent: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const client = getOpencodeClient();

			const payload = {
				agent: input.agent ?? "docs-agent",
				parts: [{ type: "text" as const, text: input.message }],
				model: env.FAST_MODE
					? { providerID: "cerebras", modelID: "zai-glm-4.6" }
					: { providerID: "opencode", modelID: "big-pickle" },
			};

			const result = await client.session.prompt({
				path: { id: input.sessionId },
				body: payload,
			});

			if (!result.data) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send prompt",
				});
			}

			const message = transformMessage(result.data.info, result.data.parts);

			// Update Redis status to busy
			const store = getOpencodeStore();
			await store.updateStatus(input.sessionId, { type: "busy" });

			return message;
		}),

	/**
	 * Send a prompt asynchronously (fire and forget)
	 */
	sendPromptAsync: publicProcedure
		.input(
			z.object({
				sessionId: z.string(),
				message: z.string().min(1),
				agent: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const client = getOpencodeClient();

			const payload = {
				agent: input.agent ?? "docs-agent",
				parts: [{ type: "text" as const, text: input.message }],
				model: env.FAST_MODE
					? { providerID: "cerebras", modelID: "zai-glm-4.6" }
					: { providerID: "opencode", modelID: "big-pickle" },
			};

			await client.session.promptAsync({
				path: { id: input.sessionId },
				body: payload,
			});

			// Update Redis status to busy
			const store = getOpencodeStore();
			await store.updateStatus(input.sessionId, { type: "busy" });

			return { sessionId: input.sessionId };
		}),

	// ========================================================================
	// Ticket Integration
	// ========================================================================

	/**
	 * Get all pending OpenCode inquiries for tickets
	 */
	getPendingInquiries: publicProcedure.query(async () => {
		const store = getOpencodeStore();
		const activeSessions = await store.getAllActiveSessions();

		return activeSessions
			.filter(
				(
					s,
				): s is StoredSessionState & { ticketId: string; sessionType: "ask" } =>
					!!s.ticketId && s.sessionType === "ask",
			)
			.map((s) => ({
				ticketId: s.ticketId,
				sessionId: s.session.id,
				sessionType: s.sessionType,
				status: s.status,
				startedAt: s.startedAt,
			}));
	}),

	/**
	 * Start a session for a ticket
	 */
	startSessionForTicket: publicProcedure
		.input(
			z.object({
				ticketId: z.string(),
				sessionType: z.enum(["chat", "ask", "admin"]).default("chat"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Get ticket
			const ticket = await ctx.db.query.tickets.findFirst({
				where: eq(tickets.id, input.ticketId),
			});

			if (!ticket) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Ticket not found",
				});
			}

			// Create session
			const client = getOpencodeClient();
			const result = await client.session.create({
				body: { title: `Ticket: ${ticket.title} (${input.ticketId})` },
			});

			if (!result.data) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create session",
				});
			}

			const session = result.data as Session;

			// Track in Redis
			const store = getOpencodeStore();
			await store.createTrackedSession(session, {
				ticketId: input.ticketId,
				sessionType: input.sessionType,
			});

			return { sessionId: session.id };
		}),

	/**
	 * Ask OpenCode about implementing a ticket
	 */
	askOpencode: publicProcedure
		.input(
			z.object({
				ticketId: z.string(),
				question: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Get ticket with recommendations and rankings
			const ticket = await ctx.db.query.tickets.findFirst({
				where: eq(tickets.id, input.ticketId),
				with: {
					recommendations: {
						orderBy: (r, { desc }) => desc(r.createdAt),
						limit: 1,
					},
					rankings: {
						orderBy: (r, { desc }) => desc(r.createdAt),
						limit: 1,
					},
				},
			});

			if (!ticket) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Ticket not found",
				});
			}

			// Build the prompt
			const latestRanking = ticket.rankings?.[0];
			const rankingContext = latestRanking
				? dedent(`
					\n\nAI Analysis:
					- Urgency: ${latestRanking.urgencyScore}/10
					- Impact: ${latestRanking.impactScore}/10
					- Complexity: ${latestRanking.complexityScore}/10
					- Overall Score: ${latestRanking.overallScore}/10
					- Reasoning: ${latestRanking.reasoning ?? "N/A"}
				`)
				: "";

			const defaultQuestion = dedent(`
				Please analyze this ticket and provide:
				1. A high-level implementation plan with key steps (keep this very short)
				2. Which files/modules in the codebase are most likely to be affected
				3. Recommend a programmer for the ticket based on git history

				Be concise and helpful.
			`);

			const prompt = dedent(`
				Ticket: ${ticket.title}
				Provider: ${ticket.provider}
				Status: ${ticket.status}
				Priority: ${ticket.priority ?? "medium"}
				Labels: ${(ticket.labels ?? []).join(", ") || "none"}
				${rankingContext}

				Description:
				${ticket.description ?? "No description provided."}

				---

				${input.question ?? defaultQuestion}
			`);

			// Create session
			const client = getOpencodeClient();
			const sessionResult = await client.session.create({
				body: { title: `Ticket: ${ticket.title} (${input.ticketId})` },
			});

			if (!sessionResult.data) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create session",
				});
			}

			const session = sessionResult.data as Session;

			// Track in Redis
			const store = getOpencodeStore();
			await store.createTrackedSession(session, {
				ticketId: input.ticketId,
				sessionType: "ask",
			});

			// Send the prompt asynchronously
			const payload = {
				agent: "docs-agent",
				parts: [{ type: "text" as const, text: prompt }],
				model: env.FAST_MODE
					? { providerID: "cerebras", modelID: "zai-glm-4.6" }
					: { providerID: "opencode", modelID: "big-pickle" },
			};

			await client.session.promptAsync({
				path: { id: session.id },
				body: payload,
			});

			// Update status
			await store.updateStatus(session.id, { type: "busy" });

			return {
				sessionId: session.id,
				isNewSession: true,
			};
		}),

	/**
	 * Get chat for a ticket (from active session or history)
	 */
	getTicketChat: publicProcedure
		.input(
			z.object({
				ticketId: z.string(),
				sessionId: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			// Get ticket
			const ticket = await ctx.db.query.tickets.findFirst({
				where: eq(tickets.id, input.ticketId),
			});

			if (!ticket) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Ticket not found",
				});
			}

			const store = getOpencodeStore();

			// If explicit sessionId provided, get that session
			if (input.sessionId) {
				const trackedSession = await store.getTrackedSession(input.sessionId);
				if (trackedSession) {
					const storedMessages = await store.getMessages(input.sessionId);
					const messagesWithParts = await Promise.all(
						storedMessages.map(async (info) => {
							const parts = await store.getParts(info.id);
							return transformMessage(info, parts);
						}),
					);

					const status = await store.getStatus(input.sessionId);
					const allParts = await Promise.all(
						storedMessages.map((m) => store.getParts(m.id)),
					);
					const toolCalls = getCurrentToolCalls(allParts.flat());

					return {
						messages: messagesWithParts,
						currentSessionId: input.sessionId,
						status: status ?? { type: "idle" as const },
						toolCalls,
						isNewSession: false,
					};
				}
			}

			// Check for active session
			const activeSessionId = await store.getActiveSessionForTicket(
				input.ticketId,
			);
			if (activeSessionId) {
				const trackedSession = await store.getTrackedSession(activeSessionId);
				if (trackedSession) {
					const storedMessages = await store.getMessages(activeSessionId);
					const messagesWithParts = await Promise.all(
						storedMessages.map(async (info) => {
							const parts = await store.getParts(info.id);
							return transformMessage(info, parts);
						}),
					);

					const status = await store.getStatus(activeSessionId);
					const allParts = await Promise.all(
						storedMessages.map((m) => store.getParts(m.id)),
					);
					const toolCalls = getCurrentToolCalls(allParts.flat());

					return {
						messages: messagesWithParts,
						currentSessionId: activeSessionId,
						status: status ?? { type: "idle" as const },
						toolCalls,
						isNewSession: false,
					};
				}
			}

			// No active session
			return {
				messages: [],
				currentSessionId: null,
				status: { type: "idle" as const },
				toolCalls: [],
				isNewSession: true,
			};
		}),

	/**
	 * Send a message to a ticket's chat
	 */
	sendTicketMessage: publicProcedure
		.input(
			z.object({
				ticketId: z.string(),
				message: z.string().min(1),
				sessionId: z.string().optional(),
				agent: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Get ticket
			const ticket = await ctx.db.query.tickets.findFirst({
				where: eq(tickets.id, input.ticketId),
			});

			if (!ticket) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Ticket not found",
				});
			}

			const store = getOpencodeStore();
			const client = getOpencodeClient();

			let sessionId = input.sessionId;

			// Get or create session
			if (!sessionId) {
				sessionId = await store.getActiveSessionForTicket(input.ticketId);
			}

			if (!sessionId) {
				// Create new session
				const result = await client.session.create({
					body: { title: `Ticket: ${ticket.title} (${input.ticketId})` },
				});

				if (!result.data) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create session",
					});
				}

				sessionId = (result.data as Session).id;
				await store.createTrackedSession(result.data as Session, {
					ticketId: input.ticketId,
					sessionType: "chat",
				});
			}

			// Send message
			const payload = {
				agent: input.agent ?? "docs-agent",
				parts: [{ type: "text" as const, text: input.message }],
				model: env.FAST_MODE
					? { providerID: "cerebras", modelID: "zai-glm-4.6" }
					: { providerID: "opencode", modelID: "big-pickle" },
			};

			const result = await client.session.prompt({
				path: { id: sessionId },
				body: payload,
			});

			if (!result.data) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send message",
				});
			}

			// Update status
			await store.updateStatus(sessionId, { type: "busy" });

			const message = transformMessage(result.data.info, result.data.parts);

			return {
				...message,
				sessionId,
				isNewSession: !input.sessionId,
			};
		}),
});
