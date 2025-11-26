import {
	BaseTicketProvider,
	type ExternalTicket,
	type TicketProviderConfig,
} from "./base";

interface JiraIssue {
	id: string;
	key: string;
	fields: {
		summary: string;
		description: string | null;
		status: { name: string };
		priority: { name: string } | null;
		assignee: { displayName: string; emailAddress: string } | null;
		labels: string[];
		created: string;
		updated: string;
		[key: string]: unknown;
	};
}

interface JiraSearchResponse {
	issues: JiraIssue[];
	total: number;
	maxResults: number;
	startAt: number;
}

/**
 * Jira ticket provider implementation
 */
export class JiraTicketProvider extends BaseTicketProvider {
	readonly name = "jira" as const;

	isConfigured(): boolean {
		return !!(
			this.config.baseUrl &&
			this.config.apiToken &&
			this.config.projectKey
		);
	}

	async listTickets(): Promise<ExternalTicket[]> {
		if (!this.isConfigured()) {
			console.warn("Jira provider not configured, returning empty list");
			return [];
		}

		try {
			const jql = `project = ${this.config.projectKey} ORDER BY updated DESC`;
			const response = await fetch(
				`${this.config.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=100`,
				{
					headers: this.getHeaders(),
				},
			);

			if (!response.ok) {
				throw new Error(
					`Jira API error: ${response.status} ${response.statusText}`,
				);
			}

			const data = (await response.json()) as JiraSearchResponse;
			return data.issues.map((issue) => this.mapJiraIssue(issue));
		} catch (error) {
			console.error("Failed to fetch Jira tickets:", error);
			return [];
		}
	}

	async getTicket(externalId: string): Promise<ExternalTicket | null> {
		if (!this.isConfigured()) {
			return null;
		}

		try {
			const response = await fetch(
				`${this.config.baseUrl}/rest/api/3/issue/${externalId}`,
				{
					headers: this.getHeaders(),
				},
			);

			if (!response.ok) {
				if (response.status === 404) return null;
				throw new Error(
					`Jira API error: ${response.status} ${response.statusText}`,
				);
			}

			const issue = (await response.json()) as JiraIssue;
			return this.mapJiraIssue(issue);
		} catch (error) {
			console.error(`Failed to fetch Jira ticket ${externalId}:`, error);
			return null;
		}
	}

	private getHeaders(): HeadersInit {
		// Jira Cloud uses Basic Auth with email:api-token
		// The token should be base64 encoded email:token
		return {
			Authorization: `Basic ${this.config.apiToken}`,
			Accept: "application/json",
			"Content-Type": "application/json",
		};
	}

	private mapJiraIssue(issue: JiraIssue): ExternalTicket {
		return {
			externalId: issue.key,
			title: issue.fields.summary,
			description: issue.fields.description,
			status: this.mapStatus(issue.fields.status.name),
			priority: this.mapPriority(issue.fields.priority?.name ?? null),
			assignee: issue.fields.assignee?.displayName ?? null,
			labels: issue.fields.labels,
			metadata: {
				jiraId: issue.id,
				jiraKey: issue.key,
				fullFields: issue.fields,
			},
			createdAt: new Date(issue.fields.created),
			updatedAt: issue.fields.updated ? new Date(issue.fields.updated) : null,
		};
	}
}

export function createJiraProvider(
	config?: TicketProviderConfig,
): JiraTicketProvider {
	return new JiraTicketProvider(config ?? {});
}
