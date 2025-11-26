import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		// Better Auth
		BETTER_AUTH_SECRET:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		BETTER_AUTH_GITHUB_CLIENT_ID: z.string(),
		BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string(),

		// Database
		DATABASE_URL: z.string().url(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),

		// AI Providers (optional in development)
		OPENROUTER_API_KEY: z.string().optional(),
		CEREBRAS_API_KEY: z.string().optional(),
		AI_PROVIDER_MODE: z.enum(["openrouter-only", "full"]).default("full"),

		// Jira Provider (optional)
		JIRA_BASE_URL: z.string().url().optional(),
		JIRA_API_TOKEN: z.string().optional(),
		JIRA_PROJECT_KEY: z.string().optional(),

		// Linear Provider (optional)
		LINEAR_API_KEY: z.string().optional(),

		// Docker/Opencode (optional, for future use)
		DOCKER_SOCKET: z.string().optional(),
		OPENCODE_IMAGE: z.string().optional(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		// Better Auth
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		BETTER_AUTH_GITHUB_CLIENT_ID: process.env.BETTER_AUTH_GITHUB_CLIENT_ID,
		BETTER_AUTH_GITHUB_CLIENT_SECRET:
			process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET,

		// Database
		DATABASE_URL: process.env.DATABASE_URL,
		NODE_ENV: process.env.NODE_ENV,

		// AI Providers
		OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
		CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
		AI_PROVIDER_MODE: process.env.AI_PROVIDER_MODE,

		// Jira Provider
		JIRA_BASE_URL: process.env.JIRA_BASE_URL,
		JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
		JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY,

		// Linear Provider
		LINEAR_API_KEY: process.env.LINEAR_API_KEY,

		// Docker/Opencode
		DOCKER_SOCKET: process.env.DOCKER_SOCKET,
		OPENCODE_IMAGE: process.env.OPENCODE_IMAGE,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
