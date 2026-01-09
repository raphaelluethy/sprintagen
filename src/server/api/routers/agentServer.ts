/**
 * Agent Server tRPC Router
 *
 * Handles all AI agent operations including session management,
 * message handling, and real-time updates.
 *
 * Uses the AgentRegistry abstraction to support pluggable agent providers.
 * Provider-specific features are accessed via the capabilities pattern.
 */

import { TRPCError } from "@trpc/server";
import dedent from "dedent";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
	agentRegistry,
	getCurrentToolCalls,
	getDefaultModel,
	getOpencodeClient,
	OpencodeProvider,
	transformMessage,
} from "@/server/ai-agents";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { ticketRecommendations, tickets } from "@/server/db/schema";
import { opencodeTicketService } from "@/server/tickets/opencode-service";

// Initialize the registry with the OpenCode provider if not already registered
if (!agentRegistry.has("opencode")) {
	agentRegistry.register(new OpencodeProvider());
}

export const agentServerRouter = createTRPCRouter({
	// ========================================================================
	// Health & Status
	// ========================================================================

	/**
	 * Check if agent server is available
	 */
	health: publicProcedure.query(async () => {
		try {
			const provider = agentRegistry.getActive();
			const available = await provider.checkHealth();
			return { available };
		} catch {
			return { available: false };
		}
	}),

	/**
	 * Get capabilities of the active provider
	 */
	getCapabilities: publicProcedure.query(() => {
		const provider = agentRegistry.getActive();
		return provider.getCapabilities();
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
		try {
			const provider = agentRegistry.getActive();
			return await provider.listSessions();
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message:
					error instanceof Error ? error.message : "Failed to list sessions",
			});
		}
	}),

	/**
	 * Get session by ID
	 */
	getSession: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const provider = agentRegistry.getActive();
			const session = await provider.getSession(input.id);

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Session not found",
				});
			}

			return session;
		}),

	/**
	 * Get session status (requires sessionStatus capability)
	 */
	getSessionStatus: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const provider = agentRegistry.getActive();
			const capabilities = provider.getCapabilities();

			if (!capabilities.sessionStatus || !provider.getSessionStatus) {
				return { type: "idle" as const };
			}

			return await provider.getSessionStatus(input.id);
		}),

	/**
	 * Get all session statuses (requires sessionStatus capability)
	 */
	getAllSessionStatus: publicProcedure.query(async () => {
		const provider = agentRegistry.getActive();
		const capabilities = provider.getCapabilities();

		if (!capabilities.sessionStatus || !provider.getAllSessionStatuses) {
			return {};
		}

		return await provider.getAllSessionStatuses();
	}),

	/**
	 * Get session diff (requires sessionDiff capability)
	 */
	getSessionDiff: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const provider = agentRegistry.getActive();
			const capabilities = provider.getCapabilities();

			if (!capabilities.sessionDiff || !provider.getSessionDiff) {
				return [];
			}

			return await provider.getSessionDiff(input.id);
		}),

	/**
	 * Get session todos (requires sessionTodos capability)
	 */
	getSessionTodos: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const provider = agentRegistry.getActive();
			const capabilities = provider.getCapabilities();

			if (!capabilities.sessionTodos || !provider.getSessionTodos) {
				return [];
			}

			return await provider.getSessionTodos(input.id);
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
			try {
				const provider = agentRegistry.getActive();
				return await provider.getMessages(input.sessionId);
			} catch {
				return [];
			}
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

			const allParts = (messagesResult.data ?? []).flatMap((m) => m.parts);

			const messages = (messagesResult.data ?? []).map((m) =>
				transformMessage(m.info, m.parts),
			);

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
			try {
				const provider = agentRegistry.getActive();
				const session = await provider.createSession(
					input.title ?? "New Session",
				);
				// If ticketId is provided, we might want to store the session ID in the ticket metadata
				// But for now, we just return the session
				return session;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Failed to create session",
				});
			}
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
			try {
				const provider = agentRegistry.getActive();
				const model = getDefaultModel();

				return await provider.sendMessage(input.sessionId, input.message, {
					model,
				});
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Failed to send prompt",
				});
			}
		}),

	/**
	 * Send a prompt asynchronously (fire and forget)
	 * Requires asyncPrompts capability
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
			const provider = agentRegistry.getActive();
			const capabilities = provider.getCapabilities();
			const model = getDefaultModel();

			if (!capabilities.asyncPrompts || !provider.sendMessageAsync) {
				// Fallback to synchronous send if async not supported
				await provider.sendMessage(input.sessionId, input.message, { model });
				return { sessionId: input.sessionId };
			}

			await provider.sendMessageAsync(input.sessionId, input.message, {
				model,
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
		.mutation(async ({ input }) => {
			const { sessionId } = await opencodeTicketService.startSession(
				input.ticketId,
				input.sessionType,
			);
			return { sessionId };
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

			// Create session using OpencodeTicketService
			const { sessionId } = await opencodeTicketService.startSession(
				input.ticketId,
				"ask",
			);

			// Send the prompt and save recommendation on completion
			const provider = agentRegistry.getActive();
			const model = getDefaultModel();

			// Fire-and-forget: send message and save recommendation when complete
			// Use sendMessage (not async) in background to get the final response
			const sendAndSave = async () => {
				try {
					const result = await provider.sendMessage(sessionId, prompt, {
						model,
					});

					// Extract assistant's response content
					const responseContent =
						result.role === "assistant" ? result.content : undefined;

					// Save recommendation if we got a response
					if (responseContent) {
						await db.insert(ticketRecommendations).values({
							ticketId: input.ticketId,
							recommendedSteps: responseContent,
							opencodeSummary: result.metadata?.reasoning ?? null,
							modelUsed: result.metadata?.model ?? "opencode-agent",
						});
					}
				} catch (err) {
					console.error(`[askOpencode] Error sending message:`, err);
				}
			};

			// Don't await - fire and forget so we return sessionId immediately
			void sendAndSave();

			return {
				sessionId,
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
		.query(async ({ input }) => {
			const result = await opencodeTicketService.getChat(
				input.ticketId,
				input.sessionId,
			);

			// Transform AgentMessage to TransformedMessage format for frontend compatibility
			const transformedMessages = result.messages.map((m) => ({
				id: m.id,
				role: m.role,
				text: m.content,
				parts: m.parts ?? [],
				createdAt: m.createdAt,
				model: m.metadata?.model,
				reasoning: m.metadata?.reasoning,
				toolCalls: m.metadata?.toolCalls,
			}));

			// Extract tool calls from all messages for status display
			const allToolCalls = result.messages.flatMap((m) =>
				(m.parts ?? []).filter(
					(p): p is import("@opencode-ai/sdk").ToolPart => p.type === "tool",
				),
			);

			return {
				messages: transformedMessages,
				currentSessionId: result.currentSessionId,
				status: result.status,
				toolCalls: allToolCalls,
				isNewSession: result.isNewSession,
			};
		}),
});
