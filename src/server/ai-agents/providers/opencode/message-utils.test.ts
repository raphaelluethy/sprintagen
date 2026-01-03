import type { Message, Part } from "@opencode-ai/sdk";
import { describe, expect, it } from "vitest";
import {
	extractReasoningFromParts,
	extractTextFromParts,
	extractToolCalls,
	getCreatedAt,
	getCurrentToolCalls,
	getModelLabel,
	transformMessage,
} from "./message-utils";

describe("message-utils", () => {
	describe("extractTextFromParts", () => {
		it("extracts text from text parts", () => {
			const parts: Part[] = [
				{
					id: "1",
					sessionID: "s1",
					messageID: "m1",
					type: "text",
					text: "Hello",
				},
				{
					id: "2",
					sessionID: "s1",
					messageID: "m1",
					type: "text",
					text: " World",
				},
			];

			const result = extractTextFromParts(parts);

			expect(result).toBe("Hello\n World");
		});

		it("extracts text from step-finish parts", () => {
			const parts: Part[] = [
				{
					id: "1",
					sessionID: "s1",
					messageID: "m1",
					type: "step-finish",
					reason: "Task completed",
					cost: 0,
					tokens: {
						input: 0,
						output: 0,
						reasoning: 0,
						cache: { read: 0, write: 0 },
					},
				},
			];

			const result = extractTextFromParts(parts);

			expect(result).toBe("Task completed");
		});

		it("handles mixed part types", () => {
			const parts: Part[] = [
				{
					id: "1",
					sessionID: "s1",
					messageID: "m1",
					type: "text",
					text: "Here is the result:",
				},
				{
					id: "2",
					sessionID: "s1",
					messageID: "m1",
					type: "reasoning",
					text: "Thinking...",
					time: { start: 0 },
				},
			];

			const result = extractTextFromParts(parts);

			expect(result).toBe("Here is the result:");
		});

		it("returns empty string for empty array", () => {
			const result = extractTextFromParts([]);

			expect(result).toBe("");
		});
	});

	describe("extractReasoningFromParts", () => {
		it("extracts reasoning from reasoning parts", () => {
			const parts: Part[] = [
				{
					id: "1",
					sessionID: "s1",
					messageID: "m1",
					type: "reasoning",
					text: "Step 1: Analyze the problem",
					time: { start: 0 },
				},
				{
					id: "2",
					sessionID: "s1",
					messageID: "m1",
					type: "reasoning",
					text: "Step 2: Consider solutions",
					time: { start: 100 },
				},
			];

			const result = extractReasoningFromParts(parts);

			expect(result).toBe(
				"Step 1: Analyze the problem\nStep 2: Consider solutions",
			);
		});

		it("ignores non-reasoning parts", () => {
			const parts: Part[] = [
				{
					id: "1",
					sessionID: "s1",
					messageID: "m1",
					type: "text",
					text: "Hello",
				},
				{
					id: "2",
					sessionID: "s1",
					messageID: "m1",
					type: "reasoning",
					text: "Thinking",
					time: { start: 0 },
				},
			];

			const result = extractReasoningFromParts(parts);

			expect(result).toBe("Thinking");
		});

		it("returns empty string when no reasoning parts", () => {
			const parts: Part[] = [
				{
					id: "1",
					sessionID: "s1",
					messageID: "m1",
					type: "text",
					text: "Hello",
				},
			];

			const result = extractReasoningFromParts(parts);

			expect(result).toBe("");
		});
	});

	describe("extractToolCalls", () => {
		it("extracts tool call info from tool parts", () => {
			const parts: Part[] = [
				{
					id: "1",
					sessionID: "s1",
					messageID: "m1",
					type: "tool",
					tool: "read_file",
					callID: "call-123",
					state: {
						status: "completed",
						input: {},
						output: "content",
						title: "Read",
						metadata: {},
						time: { start: 0, end: 100 },
					},
				},
			];

			const result = extractToolCalls(parts);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				toolName: "read_file",
				toolCallId: "call-123",
			});
		});

		it("extracts multiple tool calls", () => {
			const parts: Part[] = [
				{
					id: "1",
					sessionID: "s1",
					messageID: "m1",
					type: "tool",
					tool: "read_file",
					callID: "call-1",
					state: {
						status: "completed",
						input: {},
						output: "",
						title: "",
						metadata: {},
						time: { start: 0, end: 0 },
					},
				},
				{
					id: "2",
					sessionID: "s1",
					messageID: "m1",
					type: "tool",
					tool: "write_file",
					callID: "call-2",
					state: { status: "running", input: {}, time: { start: 0 } },
				},
			];

			const result = extractToolCalls(parts);

			expect(result).toHaveLength(2);
			expect(result[0]?.toolName).toBe("read_file");
			expect(result[1]?.toolName).toBe("write_file");
		});

		it("returns empty array when no tool parts", () => {
			const parts: Part[] = [
				{
					id: "1",
					sessionID: "s1",
					messageID: "m1",
					type: "text",
					text: "Hello",
				},
			];

			const result = extractToolCalls(parts);

			expect(result).toHaveLength(0);
		});
	});

	describe("getModelLabel", () => {
		it("extracts model from message.model", () => {
			const message = {
				id: "m1",
				sessionID: "s1",
				role: "assistant" as const,
				model: { providerID: "opencode", modelID: "big-pickle" },
			} as unknown as Message;

			const result = getModelLabel(message);

			expect(result).toBe("opencode/big-pickle");
		});

		it("extracts model from top-level fields", () => {
			const message = {
				id: "m1",
				sessionID: "s1",
				role: "assistant" as const,
				providerID: "cerebras",
				modelID: "zai-glm-4.6",
			} as unknown as Message;

			const result = getModelLabel(message);

			expect(result).toBe("cerebras/zai-glm-4.6");
		});

		it("returns undefined when no model info", () => {
			const message = {
				id: "m1",
				sessionID: "s1",
				role: "user" as const,
			} as Message;

			const result = getModelLabel(message);

			expect(result).toBeUndefined();
		});
	});

	describe("getCreatedAt", () => {
		it("uses time.created when available", () => {
			const timestamp = 1705320000000;
			const message = {
				id: "m1",
				sessionID: "s1",
				role: "assistant" as const,
				time: { created: timestamp },
			} as unknown as Message;

			const result = getCreatedAt(message);

			expect(result.getTime()).toBe(timestamp);
		});

		it("falls back to time.completed", () => {
			const timestamp = 1705320000000;
			const message = {
				id: "m1",
				sessionID: "s1",
				role: "assistant" as const,
				time: { completed: timestamp },
			} as unknown as Message;

			const result = getCreatedAt(message);

			expect(result.getTime()).toBe(timestamp);
		});

		it("falls back to current time when no time info", () => {
			const before = Date.now();
			const message = {
				id: "m1",
				sessionID: "s1",
				role: "assistant" as const,
			} as Message;

			const result = getCreatedAt(message);
			const after = Date.now();

			expect(result.getTime()).toBeGreaterThanOrEqual(before);
			expect(result.getTime()).toBeLessThanOrEqual(after);
		});
	});

	describe("getCurrentToolCalls", () => {
		it("returns only pending and running tool calls", () => {
			const parts: Part[] = [
				{
					id: "1",
					sessionID: "s1",
					messageID: "m1",
					type: "tool",
					tool: "read_file",
					callID: "call-1",
					state: {
						status: "completed",
						input: {},
						output: "",
						title: "",
						metadata: {},
						time: { start: 0, end: 0 },
					},
				},
				{
					id: "2",
					sessionID: "s1",
					messageID: "m1",
					type: "tool",
					tool: "write_file",
					callID: "call-2",
					state: { status: "running", input: {}, time: { start: 0 } },
				},
				{
					id: "3",
					sessionID: "s1",
					messageID: "m1",
					type: "tool",
					tool: "search",
					callID: "call-3",
					state: { status: "pending", input: {}, raw: "" },
				},
			];

			const result = getCurrentToolCalls(parts);

			expect(result).toHaveLength(2);
			expect(result.map((p) => p.tool)).toEqual(["write_file", "search"]);
		});
	});

	describe("transformMessage", () => {
		it("transforms SDK message into normalized format", () => {
			const info = {
				id: "m1",
				sessionID: "s1",
				role: "assistant" as const,
				model: { providerID: "opencode", modelID: "big-pickle" },
				time: { created: 1705320000000 },
			} as unknown as Message;

			const parts: Part[] = [
				{
					id: "p1",
					sessionID: "s1",
					messageID: "m1",
					type: "text",
					text: "Hello, world!",
				},
			];

			const result = transformMessage(info, parts);

			expect(result.id).toBe("m1");
			expect(result.role).toBe("assistant");
			expect(result.text).toBe("Hello, world!");
			expect(result.model).toBe("opencode/big-pickle");
			expect(result.sessionId).toBe("s1");
			expect(result.parts).toEqual(parts);
		});

		it("includes reasoning when present", () => {
			const info = {
				id: "m1",
				sessionID: "s1",
				role: "assistant" as const,
			} as Message;

			const parts: Part[] = [
				{
					id: "p1",
					sessionID: "s1",
					messageID: "m1",
					type: "reasoning",
					text: "Analyzing...",
					time: { start: 0 },
				},
				{
					id: "p2",
					sessionID: "s1",
					messageID: "m1",
					type: "text",
					text: "Result",
				},
			];

			const result = transformMessage(info, parts);

			expect(result.reasoning).toBe("Analyzing...");
			expect(result.text).toBe("Result");
		});

		it("handles empty parts array", () => {
			const info = {
				id: "m1",
				sessionID: "s1",
				role: "user" as const,
			} as Message;

			const result = transformMessage(info, []);

			expect(result.text).toBe("");
			expect(result.parts).toEqual([]);
			expect(result.toolCalls).toEqual([]);
			expect(result.reasoning).toBeUndefined();
		});
	});
});
