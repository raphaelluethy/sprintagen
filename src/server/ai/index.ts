import { env } from "@/env";
import {
	type AnalyzeOptions,
	analyzeWithCerebras,
	isCerebrasConfigured,
} from "./cerebras";
import {
	type GenerateOptions,
	generateWithOpenRouter,
	isOpenRouterConfigured,
	OPENROUTER_DEFAULT_MODEL,
} from "./openrouter";

export {
	analyzeWithCerebras,
	CEREBRAS_DEFAULT_MODEL,
	cerebras,
	isCerebrasConfigured,
	parseJsonResponse,
} from "./cerebras";
export {
	generateWithOpenRouter,
	isOpenRouterConfigured,
	OPENROUTER_DEFAULT_MODEL,
	openrouter,
	streamWithOpenRouter,
} from "./openrouter";

export {
	buildChatSystemPrompt,
	buildChatUserPrompt,
	buildRankingPrompt,
	buildRecommendedProgrammerPrompt,
	buildRecommendedStepsPrompt,
	buildRepoContextPrompt,
} from "./prompts";

export const DEFAULT_MODEL = OPENROUTER_DEFAULT_MODEL;

/**
 * Determine which AI provider to use based on configuration.
 * Priority:
 * 1. If AI_PROVIDER_MODE is explicitly set to "openrouter-only", use OpenRouter
 * 2. If only one provider is configured, use that one
 * 3. If both are configured, prefer Cerebras for analysis (faster inference)
 */
export type AIProviderMode = "openrouter" | "cerebras" | "none";

export function getActiveAIProvider(): AIProviderMode {
	const openRouterAvailable = isOpenRouterConfigured();
	const cerebrasAvailable = isCerebrasConfigured();

	// Explicit mode override
	if (env.AI_PROVIDER_MODE === "openrouter-only" && openRouterAvailable) {
		return "openrouter";
	}

	// If only one is configured, use that one
	if (openRouterAvailable && !cerebrasAvailable) {
		return "openrouter";
	}
	if (cerebrasAvailable && !openRouterAvailable) {
		return "cerebras";
	}

	// If both are configured, prefer OpenRouter for analysis tasks
	if (cerebrasAvailable && openRouterAvailable) {
		return "openrouter";
	}

	return "none";
}

export function isAnyAIConfigured(): boolean {
	return isOpenRouterConfigured() || isCerebrasConfigured();
}

export async function analyzeWithAI(
	systemPrompt: string,
	userPrompt: string,
	options: GenerateOptions | AnalyzeOptions = {},
) {
	const provider = getActiveAIProvider();

	if (provider === "openrouter") {
		return generateWithOpenRouter(systemPrompt, userPrompt, options);
	}

	if (provider === "cerebras") {
		return analyzeWithCerebras(systemPrompt, userPrompt, options);
	}

	throw new Error(
		"No AI provider configured. Set OPENROUTER_API_KEY or CEREBRAS_API_KEY.",
	);
}
