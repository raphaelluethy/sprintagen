import { TRPCError } from "@trpc/server";
import dedent from "dedent";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	analyzeWithAI,
	buildChatSystemPrompt,
	buildChatUserPrompt,
	buildRankingPrompt,
	buildRecommendedProgrammerPrompt,
	buildRecommendedStepsPrompt,
	DEFAULT_MODEL,
	getActiveAIProvider,
	isCerebrasConfigured,
	isOpenRouterConfigured,
	parseJsonResponse,
} from "@/server/ai";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
	ticketMessages,
	ticketPriorityEnum,
	ticketProviderEnum,
	ticketRankings,
	ticketRecommendations,
	ticketStatusEnum,
	tickets,
} from "@/server/db/schema";
import {
	askOpencodeQuestion,
	checkOpencodeHealth,
	createNewOpencodeSessionForTicket,
	getOpencodeMessages,
	sendOpencodeMessage,
} from "@/server/tickets/opencode";
import { getProviderRegistry } from "@/server/tickets/provider-registry";
import {
	createManualTicket,
	syncAllProviders,
	syncProvider,
} from "@/server/tickets/sync";

export const ticketRouter = createTRPCRouter({
	// ========================================================================
	// Queries
	// ========================================================================

	/**
	 * List all tickets with optional filters and sorting
	 */
	list: publicProcedure
		.input(
			z
				.object({
					status: z.enum(ticketStatusEnum).optional(),
					priority: z.enum(ticketPriorityEnum).optional(),
					provider: z.enum(ticketProviderEnum).optional(),
					sortBy: z
						.enum(["createdAt", "updatedAt", "priority", "aiScore"])
						.default("createdAt"),
					sortOrder: z.enum(["asc", "desc"]).default("desc"),
					limit: z.number().min(1).max(100).default(50),
					offset: z.number().min(0).default(0),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const status = input?.status;
			const priority = input?.priority;
			const provider = input?.provider;
			const sortBy = input?.sortBy ?? "createdAt";
			const sortOrder = input?.sortOrder ?? "desc";
			const limit = input?.limit ?? 50;
			const offset = input?.offset ?? 0;

			// Build where conditions
			const conditions = [];
			if (status) conditions.push(eq(tickets.status, status));
			if (priority) conditions.push(eq(tickets.priority, priority));
			if (provider) conditions.push(eq(tickets.provider, provider));

			const whereClause =
				conditions.length > 0 ? and(...conditions) : undefined;

			// Build order by
			const sortColumn = {
				createdAt: tickets.createdAt,
				updatedAt: tickets.updatedAt,
				priority: tickets.priority,
				aiScore: tickets.aiScore,
			}[sortBy];

			const orderByClause =
				sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn);

			const result = await ctx.db.query.tickets.findMany({
				where: whereClause,
				orderBy: orderByClause,
				limit,
				offset,
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

			return result;
		}),

	/**
	 * Get a single ticket by ID with all related data
	 */
	byId: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const ticket = await ctx.db.query.tickets.findFirst({
				where: eq(tickets.id, input.id),
				with: {
					recommendations: {
						orderBy: (r, { desc }) => desc(r.createdAt),
						limit: 1,
					},
					messages: {
						orderBy: (m, { asc }) => asc(m.createdAt),
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

			return ticket;
		}),

	/**
	 * Get chat history for a ticket
	 */
	getChatHistory: publicProcedure
		.input(z.object({ ticketId: z.string() }))
		.query(async ({ ctx, input }) => {
			return ctx.db.query.ticketMessages.findMany({
				where: eq(ticketMessages.ticketId, input.ticketId),
				orderBy: asc(ticketMessages.createdAt),
			});
		}),

	/**
	 * Get configured providers status
	 */
	getProviderStatus: publicProcedure.query(() => {
		const registry = getProviderRegistry();
		const allProviders = registry.getAllProviders();

		return allProviders.map((p) => ({
			name: p.name,
			configured: p.isConfigured(),
		}));
	}),

	/**
	 * Get AI configuration status
	 */
	getAIStatus: publicProcedure.query(() => {
		return {
			openRouterConfigured: isOpenRouterConfigured(),
			cerebrasConfigured: isCerebrasConfigured(),
		};
	}),

	// ========================================================================
	// Mutations
	// ========================================================================

	/**
	 * Create a new manual ticket
	 */
	create: publicProcedure
		.input(
			z.object({
				title: z.string().min(1).max(500),
				description: z.string().optional(),
				priority: z.enum(ticketPriorityEnum).default("medium"),
				assignee: z.string().optional(),
				labels: z.array(z.string()).default([]),
			}),
		)
		.mutation(async ({ input }) => {
			return createManualTicket(input);
		}),

	/**
	 * Update a ticket
	 */
	update: publicProcedure
		.input(
			z.object({
				id: z.string(),
				title: z.string().min(1).max(500).optional(),
				description: z.string().optional(),
				status: z.enum(ticketStatusEnum).optional(),
				priority: z.enum(ticketPriorityEnum).optional(),
				assignee: z.string().nullable().optional(),
				labels: z.array(z.string()).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...updates } = input;

			const [updated] = await ctx.db
				.update(tickets)
				.set(updates)
				.where(eq(tickets.id, id))
				.returning();

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Ticket not found",
				});
			}

			return updated;
		}),

	/**
	 * Delete a ticket
	 */
	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(tickets).where(eq(tickets.id, input.id));
			return { success: true };
		}),

	/**
	 * Sync tickets from all configured providers
	 */
	syncAll: publicProcedure.mutation(async () => {
		return syncAllProviders();
	}),

	/**
	 * Sync tickets from a specific provider
	 */
	syncProvider: publicProcedure
		.input(z.object({ provider: z.enum(ticketProviderEnum) }))
		.mutation(async ({ input }) => {
			return syncProvider(input.provider);
		}),

	/**
	 * Send a chat message and get AI response (non-streaming for simplicity)
	 */
	chat: publicProcedure
		.input(
			z.object({
				ticketId: z.string(),
				message: z.string().min(1),
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

			// Get existing messages
			const existingMessages = await ctx.db.query.ticketMessages.findMany({
				where: eq(ticketMessages.ticketId, input.ticketId),
				orderBy: asc(ticketMessages.createdAt),
			});

			// Save user message
			await ctx.db.insert(ticketMessages).values({
				ticketId: input.ticketId,
				role: "user",
				content: input.message,
			});

			// Check if any AI provider is configured
			const activeProvider = getActiveAIProvider();
			if (activeProvider === "none") {
				// Save mock response if AI not configured
				const mockResponse =
					"AI is not configured. Please set OPENROUTER_API_KEY or CEREBRAS_API_KEY environment variable.";
				await ctx.db.insert(ticketMessages).values({
					ticketId: input.ticketId,
					role: "assistant",
					content: mockResponse,
				});
				return { response: mockResponse };
			}

			// Build prompts
			const systemPrompt = buildChatSystemPrompt(ticket);
			const userPrompt = buildChatUserPrompt(existingMessages, input.message);

			// Generate response using the active provider
			const result = await analyzeWithAI(systemPrompt, userPrompt, {
				temperature: 0.7, // Higher temperature for chat
			});

			// Determine which model was used for logging
			const modelUsed =
				activeProvider === "openrouter"
					? "openrouter/bert-nebulon-alpha"
					: "llama-3.3-70b";

			// Save assistant message
			await ctx.db.insert(ticketMessages).values({
				ticketId: input.ticketId,
				role: "assistant",
				content: result.text,
				modelUsed,
			});

			return { response: result.text };
		}),

	/**
	 * Clear chat history for a ticket
	 */
	clearChat: publicProcedure
		.input(z.object({ ticketId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.delete(ticketMessages)
				.where(eq(ticketMessages.ticketId, input.ticketId));
			return { success: true };
		}),

	/**
	 * Generate/refresh recommendations for a ticket
	 */
	generateRecommendations: publicProcedure
		.input(
			z.object({
				ticketId: z.string(),
				availableProgrammers: z.array(z.string()).default([]),
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

			const activeProvider = getActiveAIProvider();
			if (activeProvider === "none") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						"AI not configured. Set OPENROUTER_API_KEY or CEREBRAS_API_KEY.",
				});
			}

			// Generate recommended steps using the active provider
			const stepsPrompt = buildRecommendedStepsPrompt(ticket);
			const stepsResult = await analyzeWithAI(
				stepsPrompt.system,
				stepsPrompt.user,
			);

			// Generate recommended programmer (if available)
			let programmerResult = { text: "" };
			if (input.availableProgrammers.length > 0) {
				const programmerPrompt = buildRecommendedProgrammerPrompt(
					ticket,
					input.availableProgrammers,
				);
				programmerResult = await analyzeWithAI(
					programmerPrompt.system,
					programmerPrompt.user,
				);
			}

			// Determine which model was used for logging
			const modelUsed = DEFAULT_MODEL;

			// Save recommendation
			const [recommendation] = await ctx.db
				.insert(ticketRecommendations)
				.values({
					ticketId: input.ticketId,
					recommendedSteps: stepsResult.text,
					recommendedProgrammer: programmerResult.text || null,
					modelUsed,
				})
				.returning();

			return recommendation;
		}),

	/**
	 * Rank a set of tickets using AI
	 */
	rankTickets: publicProcedure
		.input(
			z.object({
				ticketIds: z.array(z.string()).min(1).max(20),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Get tickets
			const ticketsToRank = await ctx.db.query.tickets.findMany({
				where: inArray(tickets.id, input.ticketIds),
			});

			if (ticketsToRank.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "No tickets found",
				});
			}

			// Check if any AI provider is configured
			const activeProvider = getActiveAIProvider();
			if (activeProvider === "none") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						"AI not configured. Set OPENROUTER_API_KEY or CEREBRAS_API_KEY.",
				});
			}

			// Build ranking prompt
			const { system, user } = buildRankingPrompt(ticketsToRank);
			const result = await analyzeWithAI(system, user);

			// Parse response
			interface RankingResult {
				ticketId: string;
				urgencyScore: number;
				impactScore: number;
				complexityScore: number;
				overallScore: number;
				reasoning: string;
			}

			const rankings = parseJsonResponse<RankingResult[]>(result.text);

			if (!rankings) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to parse AI ranking response",
				});
			}

			// Determine which model was used for logging
			const modelUsed =
				activeProvider === "openrouter"
					? "openrouter/bert-nebulon-alpha"
					: "llama-3.3-70b";

			// Save rankings and update tickets
			const savedRankings = [];
			for (const ranking of rankings) {
				// Save ranking record
				const [saved] = await ctx.db
					.insert(ticketRankings)
					.values({
						ticketId: ranking.ticketId,
						urgencyScore: ranking.urgencyScore,
						impactScore: ranking.impactScore,
						complexityScore: ranking.complexityScore,
						overallScore: ranking.overallScore,
						reasoning: ranking.reasoning,
						modelUsed,
					})
					.returning();

				// Update ticket's AI score
				await ctx.db
					.update(tickets)
					.set({ aiScore: ranking.overallScore })
					.where(eq(tickets.id, ranking.ticketId));

				savedRankings.push(saved);
			}

			return savedRankings;
		}),

	/**
	 * Get tickets ordered by AI ranking
	 */
	listByAIRank: publicProcedure
		.input(
			z
				.object({
					limit: z.number().min(1).max(100).default(50),
					minScore: z.number().min(0).max(10).optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const { limit = 50, minScore } = input ?? {};

			const result = await ctx.db.query.tickets.findMany({
				where:
					minScore !== undefined
						? (t, { gte }) => gte(t.aiScore, minScore)
						: undefined,
				orderBy: desc(tickets.aiScore),
				limit,
				with: {
					rankings: {
						orderBy: (r, { desc }) => desc(r.createdAt),
						limit: 1,
					},
				},
			});

			return result;
		}),

	// ========================================================================
	// Opencode Integration
	// ========================================================================

	/**
	 * Check if Opencode server is available
	 */
	getOpencodeStatus: publicProcedure.query(async () => {
		const available = await checkOpencodeHealth();
		return { available };
	}),

	/**
	 * Start a new Opencode session for a ticket.
	 * Creates a fresh session and returns the sessionId without sending any message.
	 * Used by the UI to create per-open chat sessions.
	 */
	startOpencodeSession: publicProcedure
		.input(z.object({ ticketId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			// Get ticket for title
			const ticket = await ctx.db.query.tickets.findFirst({
				where: eq(tickets.id, input.ticketId),
			});

			if (!ticket) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Ticket not found",
				});
			}

			const result = await createNewOpencodeSessionForTicket(
				input.ticketId,
				ticket.title,
			);

			if (!result.success) {
				let userMessage = result.error;
				if (result.error.includes("Failed to create")) {
					userMessage =
						"Unable to create Opencode session. Please check if the server is running.";
				}

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: userMessage,
					cause: result.error,
				});
			}

			return {
				sessionId: result.data.sessionId,
			};
		}),

	/**
	 * Get Opencode chat messages for a ticket
	 * Returns messages along with session metadata for UI boundary detection.
	 * Uses lookup-only behavior: won't create a session if none exists.
	 * Optionally accepts an explicit sessionId to fetch messages from a specific session.
	 */
	getOpencodeChat: publicProcedure
		.input(
			z.object({
				ticketId: z.string(),
				sessionId: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			// Get ticket for title
			const ticket = await ctx.db.query.tickets.findFirst({
				where: eq(tickets.id, input.ticketId),
			});

			if (!ticket) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Ticket not found",
				});
			}

			const result = await getOpencodeMessages(
				input.ticketId,
				ticket.title,
				input.sessionId,
			);

			if (!result.success) {
				// Provide actionable error messages
				let userMessage = result.error;
				if (
					result.error.includes("ENOENT") ||
					result.error.includes("NotFoundError")
				) {
					userMessage =
						"Opencode session expired. A new session will be created automatically.";
				} else if (result.error.includes("Failed to fetch")) {
					userMessage =
						"Unable to reach Opencode server. Please check if it's running.";
				}

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: userMessage,
					cause: result.error,
				});
			}

			// Return messages with session metadata
			return {
				messages: result.data.messages,
				currentSessionId: result.data.currentSessionId,
				isNewSession: result.data.isNewSession,
			};
		}),

	/**
	 * Send a message to a ticket's Opencode session
	 * Returns the assistant's response along with session metadata.
	 * Optionally accepts an explicit sessionId to send into a specific session.
	 */
	sendOpencodeChatMessage: publicProcedure
		.input(
			z.object({
				ticketId: z.string(),
				message: z.string().min(1),
				agent: z.string().optional(),
				sessionId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Get ticket for title
			const ticket = await ctx.db.query.tickets.findFirst({
				where: eq(tickets.id, input.ticketId),
			});

			if (!ticket) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Ticket not found",
				});
			}

			const result = await sendOpencodeMessage(
				input.ticketId,
				ticket.title,
				input.message,
				input.sessionId,
			);

			if (!result.success) {
				// Provide actionable error messages
				let userMessage = result.error;
				if (
					result.error.includes("ENOENT") ||
					result.error.includes("NotFoundError")
				) {
					userMessage =
						"Previous session expired. A new session was created—please retry your message.";
				} else if (result.error.includes("Failed to send")) {
					userMessage =
						"Failed to send message to Opencode. Please check if the server is running.";
				}

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: userMessage,
					cause: result.error,
				});
			}

			// Return message with session metadata
			return {
				...result.data.message,
				sessionId: result.data.sessionId,
				isNewSession: result.data.isNewSession,
			};
		}),

	/**
	 * Ask Opencode about implementing a ticket and store the result
	 * Handles stale sessions gracefully and reports session boundaries
	 */
	askOpencode: publicProcedure
		.input(
			z.object({
				ticketId: z.string(),
				question: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Get ticket with latest recommendation and ranking
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

			// Build the prompt with ticket context
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
				1. A high-level implementation plan with key steps
				2. Which files/modules in the codebase are most likely to be affected
				3. Recommend a programmer for the ticket that has touched the files that are most likely to be affected most recently using git history
				4. Any risks or considerations

				Be concise but thorough.
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

			console.log("[OPENCODE] Prompt:", prompt);

			// Send to Opencode
			const result = await askOpencodeQuestion(
				input.ticketId,
				ticket.title,
				prompt,
			);

			if (!result.success) {
				// Provide actionable error messages
				let userMessage = result.error;
				if (
					result.error.includes("ENOENT") ||
					result.error.includes("NotFoundError")
				) {
					userMessage =
						"Previous Opencode session expired. A new session was created—please try again.";
				} else if (result.error.includes("Failed to create")) {
					userMessage =
						"Unable to create Opencode session. Please check if the server is running.";
				} else if (result.error.includes("Failed to send")) {
					userMessage =
						"Failed to communicate with Opencode. Please check if the server is running.";
				}

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: userMessage,
					cause: result.error,
				});
			}

			// Create a new recommendation with the Opencode summary
			const [recommendation] = await ctx.db
				.insert(ticketRecommendations)
				.values({
					ticketId: input.ticketId,
					opencodeSummary: result.data.answer,
					modelUsed: "opencode",
				})
				.returning();

			return {
				answer: result.data.answer,
				recommendation,
				sessionId: result.data.sessionId,
				isNewSession: result.data.isNewSession,
			};
		}),
});
