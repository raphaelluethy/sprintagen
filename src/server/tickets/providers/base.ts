import type {
	TicketPriority,
	TicketProvider,
	TicketStatus,
} from "@/server/db/schema";

/**
 * External ticket representation from providers (Jira, Linear, etc.)
 */
export interface ExternalTicket {
	externalId: string;
	title: string;
	description: string | null;
	status: TicketStatus;
	priority: TicketPriority;
	assignee: string | null;
	labels: string[];
	metadata: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date | null;
}

/**
 * Configuration for a ticket provider
 */
export interface TicketProviderConfig {
	baseUrl?: string;
	apiToken?: string;
	projectKey?: string;
	additionalConfig?: Record<string, unknown>;
}

/**
 * Abstract interface for ticket providers
 */
export interface ITicketProvider {
	readonly name: TicketProvider;

	/**
	 * List all tickets from the provider
	 */
	listTickets(): Promise<ExternalTicket[]>;

	/**
	 * Get a single ticket by its external ID
	 */
	getTicket(externalId: string): Promise<ExternalTicket | null>;

	/**
	 * Check if the provider is configured and ready to use
	 */
	isConfigured(): boolean;
}

/**
 * Base class for ticket providers with common functionality
 */
export abstract class BaseTicketProvider implements ITicketProvider {
	abstract readonly name: TicketProvider;
	protected config: TicketProviderConfig;

	constructor(config: TicketProviderConfig) {
		this.config = config;
	}

	abstract listTickets(): Promise<ExternalTicket[]>;
	abstract getTicket(externalId: string): Promise<ExternalTicket | null>;
	abstract isConfigured(): boolean;

	/**
	 * Map external status strings to internal status enum
	 */
	protected mapStatus(externalStatus: string): TicketStatus {
		const statusMap: Record<string, TicketStatus> = {
			// Jira statuses
			"to do": "open",
			done: "done",
			closed: "closed",
			// Linear statuses
			backlog: "open",
			todo: "open",
			"in progress": "in_progress",
			"in review": "review",
			completed: "done",
			canceled: "closed",
			cancelled: "closed",
		};

		const normalized = externalStatus.toLowerCase().trim();
		return statusMap[normalized] ?? "open";
	}

	/**
	 * Map external priority strings to internal priority enum
	 */
	protected mapPriority(
		externalPriority: string | number | null,
	): TicketPriority {
		if (externalPriority === null) return "medium";

		if (typeof externalPriority === "number") {
			// Linear uses 0-4 priority (0 = no priority, 1 = urgent, 4 = low)
			const numericMap: Record<number, TicketPriority> = {
				0: "medium",
				1: "urgent",
				2: "high",
				3: "medium",
				4: "low",
			};
			return numericMap[externalPriority] ?? "medium";
		}

		const priorityMap: Record<string, TicketPriority> = {
			highest: "urgent",
			high: "high",
			medium: "medium",
			low: "low",
			lowest: "low",
			urgent: "urgent",
			critical: "urgent",
		};

		const normalized = externalPriority.toLowerCase().trim();
		return priorityMap[normalized] ?? "medium";
	}
}

