/**
 * Model selection strategy
 *
 * Centralizes model selection logic that was previously hardcoded
 * across opencode.ts router and tickets/opencode.ts.
 */

import { env } from "@/env";
import type { ModelSelection, ModelSelectorConfig, ModelTier } from "./types";

/**
 * Model configurations by tier
 */
const MODEL_TIERS: Record<ModelTier, ModelSelection> = {
	fast: {
		providerId: "cerebras",
		modelId: "zai-glm-4.6",
	},
	standard: {
		providerId: "opencode",
		modelId: "big-pickle",
	},
	premium: {
		providerId: "anthropic",
		modelId: "claude-sonnet-4-20250514",
	},
};

/**
 * Get the default model based on environment configuration
 *
 * @param config - Optional configuration override
 * @returns The selected model configuration
 *
 * @example
 * ```typescript
 * // Use environment FAST_MODE setting
 * const model = getDefaultModel();
 *
 * // Override fast mode
 * const fastModel = getDefaultModel({ fastMode: true });
 *
 * // Use specific model
 * const customModel = getDefaultModel({
 *   fastMode: false,
 *   override: { providerId: "anthropic", modelId: "claude-3-opus" }
 * });
 * ```
 */
export function getDefaultModel(config?: ModelSelectorConfig): ModelSelection {
	// If explicit override provided, use it
	if (config?.override) {
		return config.override;
	}

	// Determine if fast mode from config or environment
	const useFastMode = config?.fastMode ?? env.FAST_MODE;

	return useFastMode ? MODEL_TIERS.fast : MODEL_TIERS.standard;
}

/**
 * Get model configuration for a specific tier
 *
 * @param tier - The model tier to get
 * @returns The model configuration for that tier
 */
export function getModelForTier(tier: ModelTier): ModelSelection {
	return MODEL_TIERS[tier];
}

/**
 * Format model selection for logging/display
 *
 * @param model - The model selection
 * @returns Formatted string like "cerebras/zai-glm-4.6"
 */
export function formatModelLabel(model: ModelSelection): string {
	return `${model.providerId}/${model.modelId}`;
}

/**
 * Check if current configuration is using fast mode
 */
export function isFastMode(): boolean {
	return env.FAST_MODE === true;
}
