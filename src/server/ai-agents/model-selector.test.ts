import { describe, expect, it, vi } from "vitest";
import {
	formatModelLabel,
	getDefaultModel,
	getModelForTier,
} from "./model-selector";

// Mock the env module
vi.mock("@/env", () => ({
	env: {
		FAST_MODE: false,
	},
}));

describe("model-selector", () => {
	describe("getDefaultModel", () => {
		it("returns standard model when fastMode is false", () => {
			const model = getDefaultModel({ fastMode: false });

			expect(model.providerId).toBe("opencode");
			expect(model.modelId).toBe("big-pickle");
		});

		it("returns fast model when fastMode is true", () => {
			const model = getDefaultModel({ fastMode: true });

			expect(model.providerId).toBe("cerebras");
			expect(model.modelId).toBe("zai-glm-4.6");
		});

		it("uses override when provided", () => {
			const override = { providerId: "custom", modelId: "my-model" };
			const model = getDefaultModel({ fastMode: true, override });

			expect(model).toEqual(override);
		});

		it("override takes precedence over fastMode", () => {
			const override = { providerId: "anthropic", modelId: "claude-3" };
			const model = getDefaultModel({ fastMode: true, override });

			expect(model).toEqual(override);
		});
	});

	describe("getModelForTier", () => {
		it("returns fast tier model", () => {
			const model = getModelForTier("fast");

			expect(model.providerId).toBe("cerebras");
			expect(model.modelId).toBe("zai-glm-4.6");
		});

		it("returns standard tier model", () => {
			const model = getModelForTier("standard");

			expect(model.providerId).toBe("opencode");
			expect(model.modelId).toBe("big-pickle");
		});

		it("returns premium tier model", () => {
			const model = getModelForTier("premium");

			expect(model.providerId).toBe("anthropic");
			expect(model.modelId).toBe("claude-sonnet-4-20250514");
		});
	});

	describe("formatModelLabel", () => {
		it("formats provider and model as slash-separated string", () => {
			const label = formatModelLabel({
				providerId: "opencode",
				modelId: "big-pickle",
			});

			expect(label).toBe("opencode/big-pickle");
		});
	});
});
