import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	analyzeWithAI,
	analyzeWithCerebras,
	buildChatSystemPrompt,
	buildChatUserPrompt,
	buildRankingPrompt,
	buildRecommendedProgrammerPrompt,
	buildRecommendedStepsPrompt,
	generateWithOpenRouter,
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

			// Check if OpenRouter is configured
			if (!isOpenRouterConfigured()) {
				// Save mock response if AI not configured
				const mockResponse =
					"AI is not configured. Please set OPENROUTER_API_KEY environment variable.";
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

			// Generate response
			const result = await generateWithOpenRouter(systemPrompt, userPrompt);

			// Save assistant message
			await ctx.db.insert(ticketMessages).values({
				ticketId: input.ticketId,
				role: "assistant",
				content: result.text,
				modelUsed: "grok-3-fast",
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

			if (!isOpenRouterConfigured()) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "AI not configured. Set OPENROUTER_API_KEY.",
				});
			}

			// Generate recommended steps
			const stepsPrompt = buildRecommendedStepsPrompt(ticket);
			const stepsResult = await generateWithOpenRouter(
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
				programmerResult = await generateWithOpenRouter(
					programmerPrompt.system,
					programmerPrompt.user,
				);
			}

			// Save recommendation
			const [recommendation] = await ctx.db
				.insert(ticketRecommendations)
				.values({
					ticketId: input.ticketId,
					recommendedSteps: stepsResult.text,
					recommendedProgrammer: programmerResult.text || null,
					modelUsed: "grok-3-fast",
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

			// Check if either OpenRouter or Cerebras is configured based on mode
			const useOpenRouterOnly =
				isOpenRouterConfigured() && !isCerebrasConfigured();
			const useCerebrasOnly =
				isCerebrasConfigured() && !isOpenRouterConfigured();
			const useEither = isOpenRouterConfigured() || isCerebrasConfigured();

			if (!useEither) {
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

			// Save rankings and update tickets
			const savedRankings = [];
			for (const ranking of rankings) {
				// Determine which model was used based on configuration
				const modelUsed =
					isOpenRouterConfigured() && !isCerebrasConfigured()
						? "grok-3-fast"
						: "llama-3.3-70b";

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
});
