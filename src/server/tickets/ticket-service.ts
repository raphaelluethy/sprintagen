import { eq } from "drizzle-orm";
import {
	analyzeWithAI,
	buildRankingPrompt,
	buildRecommendedProgrammerPrompt,
	buildRecommendedStepsPrompt,
	DEFAULT_MODEL,
	getActiveAIProvider,
	parseJsonResponse,
} from "@/server/ai";
import { db } from "@/server/db";
import {
	type TicketPriority,
	type TicketStatus,
	ticketRankings,
	ticketRecommendations,
	tickets,
} from "@/server/db/schema";

type Ticket = typeof tickets.$inferSelect;
type TicketRanking = typeof ticketRankings.$inferSelect;
type TicketRecommendation = typeof ticketRecommendations.$inferSelect;

export interface GetTicketOptions {
	withRecommendations?: boolean;
	withRankings?: boolean;
	withMessages?: boolean;
}

export interface TicketUpdateInput {
	title?: string;
	description?: string;
	status?: TicketStatus;
	priority?: TicketPriority;
	assignee?: string | null;
	labels?: string[];
}

export interface RankingResult {
	ticketId: string;
	urgencyScore: number;
	impactScore: number;
	complexityScore: number;
	overallScore: number;
	reasoning: string;
}

export interface RecordRecommendationInput {
	recommendedSteps?: string;
	opencodeSummary?: string;
	modelUsed?: string;
}

export const ticketService = {
	async getOrThrow(
		ticketId: string,
		options: GetTicketOptions = {},
	): Promise<Ticket> {
		const { withRecommendations, withRankings, withMessages } = options;

		let ticket: Ticket | undefined;

		if (withRecommendations || withRankings || withMessages) {
			const result = await db.query.tickets.findFirst({
				where: eq(tickets.id, ticketId),
				with: {
					recommendations: withRecommendations
						? { orderBy: (r, { desc }) => desc(r.createdAt), limit: 1 }
						: undefined,
					rankings: withRankings
						? { orderBy: (r, { desc }) => desc(r.createdAt), limit: 1 }
						: undefined,
					messages: withMessages
						? { orderBy: (m, { asc }) => asc(m.createdAt) }
						: undefined,
				},
			});
			ticket = result as Ticket | undefined;
		} else {
			ticket = await db.query.tickets.findFirst({
				where: eq(tickets.id, ticketId),
			});
		}

		if (!ticket) {
			throw new Error("Ticket not found");
		}

		return ticket;
	},

	async update(ticketId: string, updates: TicketUpdateInput): Promise<Ticket> {
		const [updated] = await db
			.update(tickets)
			.set(updates)
			.where(eq(tickets.id, ticketId))
			.returning();

		if (!updated) {
			throw new Error("Ticket not found");
		}

		return updated;
	},

	async analyzeWithAI(ticketId: string): Promise<TicketRanking> {
		const activeProvider = getActiveAIProvider();
		if (activeProvider === "none") {
			throw new Error(
				"AI not configured. Set OPENROUTER_API_KEY or CEREBRAS_API_KEY.",
			);
		}

		const ticket = await ticketService.getOrThrow(ticketId);

		const { system, user } = buildRankingPrompt([ticket]);
		const result = await analyzeWithAI(system, user);

		const rankings = parseJsonResponse<RankingResult[]>(result.text);

		if (!rankings || rankings.length === 0) {
			throw new Error("Failed to parse AI ranking response");
		}

		const ranking = rankings[0];
		if (!ranking) {
			throw new Error("Failed to parse AI ranking response");
		}

		if (ranking.ticketId && ranking.ticketId !== ticketId) {
			console.warn(
				`[ticketService.analyzeWithAI] AI returned mismatched ticketId ${ranking.ticketId} for ${ticketId}`,
			);
		}

		const modelUsed =
			activeProvider === "openrouter"
				? "openrouter/bert-nebulon-alpha"
				: "llama-3.3-70b";

		const [saved] = await db
			.insert(ticketRankings)
			.values({
				ticketId,
				urgencyScore: ranking.urgencyScore,
				impactScore: ranking.impactScore,
				complexityScore: ranking.complexityScore,
				overallScore: ranking.overallScore,
				reasoning: ranking.reasoning,
				modelUsed,
			})
			.returning();

		if (!saved) {
			throw new Error("Failed to save ranking");
		}

		await db
			.update(tickets)
			.set({ aiScore: ranking.overallScore })
			.where(eq(tickets.id, ticketId));

		return saved;
	},

	async generateRecommendation(
		ticketId: string,
		availableProgrammers: string[] = [],
	): Promise<TicketRecommendation> {
		const activeProvider = getActiveAIProvider();
		if (activeProvider === "none") {
			throw new Error(
				"AI not configured. Set OPENROUTER_API_KEY or CEREBRAS_API_KEY.",
			);
		}

		const ticket = await ticketService.getOrThrow(ticketId);

		const stepsPrompt = buildRecommendedStepsPrompt(ticket);
		const stepsResult = await analyzeWithAI(
			stepsPrompt.system,
			stepsPrompt.user,
		);

		let programmerResult = { text: "" };
		if (availableProgrammers.length > 0) {
			const programmerPrompt = buildRecommendedProgrammerPrompt(
				ticket,
				availableProgrammers,
			);
			programmerResult = await analyzeWithAI(
				programmerPrompt.system,
				programmerPrompt.user,
			);
		}

		const modelUsed = DEFAULT_MODEL;

		const [recommendation] = await db
			.insert(ticketRecommendations)
			.values({
				ticketId,
				recommendedSteps: stepsResult.text,
				recommendedProgrammer: programmerResult.text || null,
				modelUsed,
			})
			.returning();

		if (!recommendation) {
			throw new Error("Failed to save recommendation");
		}

		return recommendation;
	},

	async recordRecommendation(
		ticketId: string,
		data: RecordRecommendationInput,
	): Promise<void> {
		await db.insert(ticketRecommendations).values({
			ticketId,
			recommendedSteps: data.recommendedSteps ?? null,
			opencodeSummary: data.opencodeSummary ?? null,
			modelUsed: data.modelUsed ?? null,
		});
	},
};
