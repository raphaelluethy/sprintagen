/**
 * OpenCode tRPC Router
 *
 * Handles all OpenCode operations including session management,
 * message handling, and real-time updates.
 */

import type { Part, Session } from "@opencode-ai/sdk";
import { TRPCError } from "@trpc/server";
import dedent from "dedent";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { getOpencodeClient } from "@/lib/opencode-client";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { tickets } from "@/server/db/schema";
import {
	getCurrentToolCalls,
	transformMessage,
} from "@/server/opencode/message-utils";

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
		.input(z.object({ messageId: z.string(), sessionId: z.string() }))
		.query(async ({ input }) => {
			// We can't get parts for a single message easily via SDK without fetching all messages
			// So we fetch all messages and find the one we need
			const client = getOpencodeClient();
			const result = await client.session.messages({
				path: { id: input.sessionId },
			});

			if (!result.data) {
				return [];
			}

			const message = result.data.find((m) => m.info.id === input.messageId);
			return message?.parts ?? [];
		}),

	/**
	 * Get full session data (for initial load)
	 */
	getFullSession: publicProcedure
		.input(z.object({ sessionId: z.string() }))
		.query(async ({ input }) => {
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

			// If ticketId is provided, we might want to store the session ID in the ticket metadata
			// But for now, we just return the session
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

			return { sessionId: input.sessionId };
		}),

	// ========================================================================
	// Ticket Integration
	// ========================================================================

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

			// Store session ID in ticket metadata
			const metadata = (ticket.metadata ?? {}) as Record<string, unknown>;
			await ctx.db
				.update(tickets)
				.set({
					metadata: {
						...metadata,
						opencodeSessionId: session.id,
					},
				})
				.where(eq(tickets.id, input.ticketId));

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

			// Store session ID in ticket metadata
			const metadata = (ticket.metadata ?? {}) as Record<string, unknown>;
			await ctx.db
				.update(tickets)
				.set({
					metadata: {
						...metadata,
						opencodeSessionId: session.id,
					},
				})
				.where(eq(tickets.id, input.ticketId));

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

			let sessionId = input.sessionId;

			// If no explicit session ID, check ticket metadata
			if (!sessionId) {
				const metadata = (ticket.metadata ?? {}) as Record<string, unknown>;
				if (typeof metadata.opencodeSessionId === "string") {
					sessionId = metadata.opencodeSessionId;
				}
			}

			if (!sessionId) {
				return {
					messages: [],
					currentSessionId: null,
					status: { type: "idle" as const },
					toolCalls: [],
					isNewSession: false,
				};
			}

			// Fetch session data from SDK
			const client = getOpencodeClient();
			try {
				const [messagesResult, statusResult] = await Promise.all([
					client.session.messages({ path: { id: sessionId } }),
					client.session.status(),
				]);

				if (!messagesResult.data) {
					// Session might not exist on server anymore
					return {
						messages: [],
						currentSessionId: null,
						status: { type: "idle" as const },
						toolCalls: [],
						isNewSession: false,
					};
				}

				const messages = messagesResult.data.map((m) =>
					transformMessage(m.info, m.parts),
				);
				const allParts = messagesResult.data.flatMap((m) => m.parts);
				const toolCalls = getCurrentToolCalls(allParts);
				const status = statusResult.data?.[sessionId] ?? {
					type: "idle" as const,
				};

				return {
					messages,
					currentSessionId: sessionId,
					status,
					toolCalls,
					isNewSession: false,
				};
			} catch (error) {
				console.error("Failed to fetch session data:", error);
				// Fallback to empty if session fetch fails (e.g. 404)
				return {
					messages: [],
					currentSessionId: null,
					status: { type: "idle" as const },
					toolCalls: [],
					isNewSession: false,
				};
			}
		}),
});
