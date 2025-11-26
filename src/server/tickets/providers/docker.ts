import {
	BaseTicketProvider,
	type ExternalTicket,
	type TicketProviderConfig,
} from "./base";

/**
 * Docker/Opencode ticket provider (stubbed for future implementation)
 *
 * This provider will eventually:
 * 1. Start a Docker container with the Opencode CLI
 * 2. Clone and analyze a repository
 * 3. Generate tickets/issues based on code analysis
 *
 * For now, it returns mocked/empty data.
 */
export class DockerRepoTicketProvider extends BaseTicketProvider {
	readonly name = "docker" as const;

	isConfigured(): boolean {
		// TODO: Check for Docker availability and Opencode CLI configuration
		return false;
	}

	async listTickets(): Promise<ExternalTicket[]> {
		if (!this.isConfigured()) {
			console.warn("Docker provider not configured, returning empty list");
			return [];
		}

		// TODO: Implement actual Docker/Opencode integration
		// This would:
		// 1. Connect to a running Opencode container
		// 2. Fetch analyzed issues/suggestions
		// 3. Map them to ExternalTicket format

		return [];
	}

	async getTicket(externalId: string): Promise<ExternalTicket | null> {
		if (!this.isConfigured()) {
			return null;
		}

		// TODO: Implement actual ticket retrieval from Opencode
		console.log(`Would fetch Docker ticket: ${externalId}`);
		return null;
	}
}

export function createDockerProvider(
	config?: TicketProviderConfig,
): DockerRepoTicketProvider {
	return new DockerRepoTicketProvider(config ?? {});
}
