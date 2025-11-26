import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, streamText } from "ai";

/**
 * OpenRouter provider for summarizing, writing tasks, and chatbot replies
 * Using Grok model for writing/summarization tasks
 */
const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

// Default model for summarization and writing tasks
const DEFAULT_MODEL = "x-ai/grok-3-fast";

export interface GenerateOptions {
	model?: string;
	maxTokens?: number;
	temperature?: number;
}

/**
 * Generate text using OpenRouter (Grok model)
 * Used for: chatbot replies, recommended steps, recommended programmer
 */
export async function generateWithOpenRouter(
	systemPrompt: string,
	userPrompt: string,
	options: GenerateOptions = {},
) {
	const {
		model = DEFAULT_MODEL,
		maxTokens = 2048,
		temperature = 0.7,
	} = options;

	const result = await generateText({
		model: openrouter(model),
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
 * Stream text using OpenRouter (Grok model)
 * Used for: real-time chat responses
 */
export function streamWithOpenRouter(
	systemPrompt: string,
	messages: { role: "user" | "assistant"; content: string }[],
	options: GenerateOptions = {},
) {
	const {
		model = DEFAULT_MODEL,
		maxTokens = 2048,
		temperature = 0.7,
	} = options;

	return streamText({
		model: openrouter(model),
		system: systemPrompt,
		messages,
		maxOutputTokens: maxTokens,
		temperature,
	});
}

/**
 * Check if OpenRouter is configured
 */
export function isOpenRouterConfigured(): boolean {
	return !!process.env.OPENROUTER_API_KEY;
}

export { openrouter, DEFAULT_MODEL as OPENROUTER_DEFAULT_MODEL };
