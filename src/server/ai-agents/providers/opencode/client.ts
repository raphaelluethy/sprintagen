/**
 * OpenCode SDK Client
 *
 * Singleton client for OpenCode SDK operations.
 * Moved from src/lib/opencode-client.ts to consolidate agent-related code.
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import { env } from "@/env";

let client: ReturnType<typeof createOpencodeClient> | null = null;

/**
 * Get the singleton OpenCode SDK client
 *
 * @returns The configured OpenCode client instance
 *
 * @example
 * ```typescript
 * const client = getOpencodeClient();
 * const sessions = await client.session.list();
 * ```
 */
export function getOpencodeClient() {
	if (!client) {
		client = createOpencodeClient({
			baseUrl: env.OPENCODE_SERVER_URL,
			directory: env.OPENCODE_DIRECTORY,
			responseStyle: "fields",
			throwOnError: false,
		});
	}

	return client;
}

/**
 * Reset the client (useful for testing)
 */
export function resetOpencodeClient(): void {
	client = null;
}
