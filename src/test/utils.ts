/**
 * Test Utilities
 *
 * Shared utilities for testing across the codebase.
 */

import type { AgentMessage, AgentSession } from "@/types";

/**
 * Counter for generating unique IDs in tests
 * Prevents collisions when multiple mocks are created in the same millisecond
 */
let mockCounter = 0;

/**
 * Create a mock agent session for testing
 */
export function createMockSession(
	overrides?: Partial<AgentSession>,
): AgentSession {
	return {
		id: `test-session-${Date.now()}-${mockCounter++}`,
		title: "Test Session",
		status: "idle",
		createdAt: new Date(),
		...overrides,
	};
}

/**
 * Create a mock agent message for testing
 */
export function createMockMessage(
	overrides?: Partial<AgentMessage>,
): AgentMessage {
	return {
		id: `test-msg-${Date.now()}-${mockCounter++}`,
		role: "assistant",
		content: "Test response",
		createdAt: new Date(),
		...overrides,
	};
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
	condition: () => boolean,
	timeout = 5000,
	interval = 100,
): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeout) {
			throw new Error("Timeout waiting for condition");
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
}

/**
 * Create a delay promise
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
