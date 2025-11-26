import { createCerebras } from "@ai-sdk/cerebras";
import { generateText } from "ai";

/**
 * Cerebras provider for search, analysis, and ranking tasks
 * Using Llama model for fast inference
 */
const cerebras = createCerebras({
	apiKey: process.env.CEREBRAS_API_KEY ?? "",
});

// Default model for search and ranking tasks
const DEFAULT_MODEL = "llama-3.3-70b";

export interface AnalyzeOptions {
	model?: string;
	maxTokens?: number;
	temperature?: number;
}

/**
 * Generate analysis using Cerebras
 * Used for: ticket ranking, scoring, repo analysis
 */
export async function analyzeWithCerebras(
	systemPrompt: string,
	userPrompt: string,
	options: AnalyzeOptions = {},
) {
	const {
		model = DEFAULT_MODEL,
		maxTokens = 2048,
		temperature = 0.3,
	} = options;

	const result = await generateText({
		model: cerebras(model),
		system: systemPrompt,
		prompt: userPrompt,
		maxOutputTokens: maxTokens,
		temperature,
	});

	return {
		text: result.text,
		usage: result.usage,
		finishReason: result.finishReason,
	};
}

/**
 * Parse a JSON response from the model, with error handling
 */
export function parseJsonResponse<T>(text: string): T | null {
	try {
		// Try to extract JSON from markdown code blocks if present
		const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		const jsonString = jsonMatch?.[1]?.trim() ?? text.trim();
		return JSON.parse(jsonString) as T;
	} catch {
		console.error("Failed to parse JSON response:", text);
		return null;
	}
}

/**
 * Check if Cerebras is configured
 */
export function isCerebrasConfigured(): boolean {
	return !!process.env.CEREBRAS_API_KEY;
}

export { cerebras, DEFAULT_MODEL as CEREBRAS_DEFAULT_MODEL };
