import { env } from "@/env";
import { analyzeWithCerebras, GenerateOptions } from "./cerebras";
import { generateWithOpenRouter, AnalyzeOptions } from "./openrouter";

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

export function shouldUseOpenRouterOnly(): boolean {
	return env.AI_PROVIDER_MODE === "openrouter-only";
}

export async function analyzeWithAI(
	systemPrompt: string,
	userPrompt: string,
	options: GenerateOptions | AnalyzeOptions = {},
) {
	if (shouldUseOpenRouterOnly()) {
		// Use OpenRouter for analysis when in openrouter-only mode
		return generateWithOpenRouter(systemPrompt, userPrompt, options);
	}

	// Use Cerebras for analysis (default behavior)
	return analyzeWithCerebras(systemPrompt, userPrompt, options);
}
