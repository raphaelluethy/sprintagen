import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		BETTER_AUTH_SECRET:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		BETTER_AUTH_GITHUB_CLIENT_ID: z.string(),
		BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string(),
		DATABASE_URL: z.string().url(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		// Opencode server configuration
		OPENCODE_SERVER_URL: z.url().default("http://localhost:4096"),
		// Optional directory scoping for opencode serve (defaults to server's cwd)
		OPENCODE_DIRECTORY: z.string().optional(),
		// Provider auth (e.g., "anthropic", "openai", "cerebras")
		OPENCODE_PROVIDER_ID: z.string().optional(),
		OPENCODE_PROVIDER_API_KEY: z.string().optional(),
		// AI Providers
		CEREBRAS_API_KEY: z.string().optional(),
		OPENROUTER_API_KEY: z.string().optional(),
		// Ticket Providers - Jira
		JIRA_BASE_URL: z.string().optional(),
		JIRA_API_TOKEN: z.string().optional(),
		JIRA_PROJECT_KEY: z.string().optional(),
		// Ticket Providers - Linear
		LINEAR_API_KEY: z.string().optional(),
		// Docker configuration
		DOCKER_SOCKET: z.string().optional(),
		OPENCODE_IMAGE: z.string().optional(),

		FAST_MODE: z.boolean().optional().default(false),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		NEXT_PUBLIC_FAST_MODE: z.boolean().optional().default(false),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		BETTER_AUTH_GITHUB_CLIENT_ID: process.env.BETTER_AUTH_GITHUB_CLIENT_ID,
		BETTER_AUTH_GITHUB_CLIENT_SECRET:
			process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
		DATABASE_URL: process.env.DATABASE_URL,
		NODE_ENV: process.env.NODE_ENV,
		// Opencode
		OPENCODE_SERVER_URL: process.env.OPENCODE_SERVER_URL,
		OPENCODE_DIRECTORY: process.env.OPENCODE_DIRECTORY,
		OPENCODE_PROVIDER_ID: process.env.OPENCODE_PROVIDER_ID,
		OPENCODE_PROVIDER_API_KEY: process.env.OPENCODE_PROVIDER_API_KEY,
		// AI Providers
		CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
		OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
		// Ticket Providers - Jira
		JIRA_BASE_URL: process.env.JIRA_BASE_URL,
		JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
		JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY,
		// Ticket Providers - Linear
		LINEAR_API_KEY: process.env.LINEAR_API_KEY,
		// Docker configuration
		DOCKER_SOCKET: process.env.DOCKER_SOCKET,
		OPENCODE_IMAGE: process.env.OPENCODE_IMAGE,
		FAST_MODE: process.env.FAST_MODE === "true",
		// Client-side - use NEXT_PUBLIC_ prefixed variable
		NEXT_PUBLIC_FAST_MODE: process.env.NEXT_PUBLIC_FAST_MODE === "true",
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
