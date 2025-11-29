import { createOpencodeClient } from "@opencode-ai/sdk";
import { env } from "@/env";

let client: ReturnType<typeof createOpencodeClient> | null = null;

/**
 * Singleton Opencode SDK client used by API routes and server modules.
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
