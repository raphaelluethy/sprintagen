import {
	BaseTicketProvider,
	type ExternalTicket,
	type TicketProviderConfig,
} from "./base";

interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	description: string | null;
	state: { name: string };
	priority: number;
	assignee: { name: string; email: string } | null;
	labels: { nodes: { name: string }[] };
	createdAt: string;
	updatedAt: string;
}

interface LinearIssuesResponse {
	data: {
		issues: {
			nodes: LinearIssue[];
		};
	};
}

/**
 * Linear ticket provider implementation
 */
export class LinearTicketProvider extends BaseTicketProvider {
	readonly name = "linear" as const;

	isConfigured(): boolean {
		return !!this.config.apiToken;
	}

	async listTickets(): Promise<ExternalTicket[]> {
		if (!this.isConfigured()) {
			console.warn("Linear provider not configured, returning empty list");
			return [];
		}

		try {
			const query = `
        query {
          issues(first: 100, orderBy: updatedAt) {
            nodes {
              id
              identifier
              title
              description
              state { name }
              priority
              assignee { name email }
              labels { nodes { name } }
              createdAt
              updatedAt
            }
          }
        }
      `;

			const response = await fetch("https://api.linear.app/graphql", {
				method: "POST",
				headers: this.getHeaders(),
				body: JSON.stringify({ query }),
			});

			if (!response.ok) {
				throw new Error(
					`Linear API error: ${response.status} ${response.statusText}`,
				);
			}

			const data = (await response.json()) as LinearIssuesResponse;
			return data.data.issues.nodes.map((issue) => this.mapLinearIssue(issue));
		} catch (error) {
			console.error("Failed to fetch Linear tickets:", error);
			return [];
		}
	}

	async getTicket(externalId: string): Promise<ExternalTicket | null> {
		if (!this.isConfigured()) {
			return null;
		}

		try {
			const query = `
        query($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            description
            state { name }
            priority
            assignee { name email }
            labels { nodes { name } }
            createdAt
            updatedAt
          }
        }
      `;

			const response = await fetch("https://api.linear.app/graphql", {
				method: "POST",
				headers: this.getHeaders(),
				body: JSON.stringify({
					query,
					variables: { id: externalId },
				}),
			});

			if (!response.ok) {
				throw new Error(
					`Linear API error: ${response.status} ${response.statusText}`,
				);
			}

			const data = (await response.json()) as {
				data: { issue: LinearIssue | null };
			};
			if (!data.data.issue) return null;
			return this.mapLinearIssue(data.data.issue);
		} catch (error) {
			console.error(`Failed to fetch Linear ticket ${externalId}:`, error);
			return null;
		}
	}

	private getHeaders(): HeadersInit {
		return {
			Authorization: this.config.apiToken ?? "",
			"Content-Type": "application/json",
		};
	}

	private mapLinearIssue(issue: LinearIssue): ExternalTicket {
		return {
			externalId: issue.identifier,
			title: issue.title,
			description: issue.description,
			status: this.mapStatus(issue.state.name),
			priority: this.mapPriority(issue.priority),
			assignee: issue.assignee?.name ?? null,
			labels: issue.labels.nodes.map((l) => l.name),
			metadata: {
				linearId: issue.id,
				linearIdentifier: issue.identifier,
			},
			createdAt: new Date(issue.createdAt),
			updatedAt: issue.updatedAt ? new Date(issue.updatedAt) : null,
		};
	}
}

export function createLinearProvider(
	config?: TicketProviderConfig,
): LinearTicketProvider {
	return new LinearTicketProvider(config ?? {});
}

