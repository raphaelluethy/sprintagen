import type { TicketProvider } from "@/server/db/schema";
import {
	createDockerProvider,
	createJiraProvider,
	createLinearProvider,
	type ITicketProvider,
	type TicketProviderConfig,
} from "./providers";

/**
 * Registry for managing ticket providers
 */
export class TicketProviderRegistry {
	private providers = new Map<TicketProvider, ITicketProvider>();

	constructor() {
		this.initializeProviders();
	}

	private initializeProviders(): void {
		// Initialize Jira provider from environment variables
		const jiraConfig: TicketProviderConfig = {
			baseUrl: process.env.JIRA_BASE_URL,
			apiToken: process.env.JIRA_API_TOKEN,
			projectKey: process.env.JIRA_PROJECT_KEY,
		};
		this.providers.set("jira", createJiraProvider(jiraConfig));

		// Initialize Linear provider from environment variables
		const linearConfig: TicketProviderConfig = {
			apiToken: process.env.LINEAR_API_KEY,
		};
		this.providers.set("linear", createLinearProvider(linearConfig));

		// Initialize Docker provider (stubbed)
		const dockerConfig: TicketProviderConfig = {
			additionalConfig: {
				dockerSocket: process.env.DOCKER_SOCKET,
				opencodeImage: process.env.OPENCODE_IMAGE,
			},
		};
		this.providers.set("docker", createDockerProvider(dockerConfig));
	}

	/**
	 * Get a specific provider by key
	 */
	getProvider(key: TicketProvider): ITicketProvider | undefined {
		return this.providers.get(key);
	}

	/**
	 * Get all configured (ready-to-use) providers
	 */
	getConfiguredProviders(): ITicketProvider[] {
		return Array.from(this.providers.values()).filter((p) => p.isConfigured());
	}

	/**
	 * Get all providers regardless of configuration status
	 */
	getAllProviders(): ITicketProvider[] {
		return Array.from(this.providers.values());
	}

	/**
	 * Check if a specific provider is configured
	 */
	isProviderConfigured(key: TicketProvider): boolean {
		const provider = this.providers.get(key);
		return provider?.isConfigured() ?? false;
	}

	/**
	 * Get a list of all provider keys that are configured
	 */
	getConfiguredProviderKeys(): TicketProvider[] {
		return Array.from(this.providers.entries())
			.filter(([_, provider]) => provider.isConfigured())
			.map(([key]) => key);
	}
}

// Singleton instance
let registryInstance: TicketProviderRegistry | null = null;

export function getProviderRegistry(): TicketProviderRegistry {
	if (!registryInstance) {
		registryInstance = new TicketProviderRegistry();
	}
	return registryInstance;
}

