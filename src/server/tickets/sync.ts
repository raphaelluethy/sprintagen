import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { type TicketProvider, tickets } from "@/server/db/schema";
import { getProviderRegistry } from "./provider-registry";
import type { ExternalTicket } from "./providers";

export interface SyncResult {
	provider: TicketProvider;
	created: number;
	updated: number;
	errors: string[];
}

export interface FullSyncResult {
	results: SyncResult[];
	totalCreated: number;
	totalUpdated: number;
	totalErrors: number;
}

/**
 * Sync tickets from a single provider into the database
 */
async function syncProviderTickets(
	providerKey: TicketProvider,
	externalTickets: ExternalTicket[],
): Promise<SyncResult> {
	const result: SyncResult = {
		provider: providerKey,
		created: 0,
		updated: 0,
		errors: [],
	};

	for (const externalTicket of externalTickets) {
		try {
			// Check if ticket already exists
			const existing = await db.query.tickets.findFirst({
				where: (t, { and, eq }) =>
					and(
						eq(t.externalId, externalTicket.externalId),
						eq(t.provider, providerKey),
					),
			});

			if (existing) {
				// Update existing ticket
				await db
					.update(tickets)
					.set({
						title: externalTicket.title,
						description: externalTicket.description,
						status: externalTicket.status,
						priority: externalTicket.priority,
						assignee: externalTicket.assignee,
						labels: externalTicket.labels,
						metadata: externalTicket.metadata,
						lastSyncedAt: new Date(),
					})
					.where(eq(tickets.id, existing.id));
				result.updated++;
			} else {
				// Create new ticket
				await db.insert(tickets).values({
					externalId: externalTicket.externalId,
					provider: providerKey,
					title: externalTicket.title,
					description: externalTicket.description,
					status: externalTicket.status,
					priority: externalTicket.priority,
					assignee: externalTicket.assignee,
					labels: externalTicket.labels,
					metadata: externalTicket.metadata,
					createdAt: externalTicket.createdAt,
					lastSyncedAt: new Date(),
				});
				result.created++;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			result.errors.push(
				`Failed to sync ticket ${externalTicket.externalId}: ${message}`,
			);
		}
	}

	return result;
}

/**
 * Sync tickets from all configured providers
 */
export async function syncAllProviders(): Promise<FullSyncResult> {
	const registry = getProviderRegistry();
	const configuredProviders = registry.getConfiguredProviders();

	const results: SyncResult[] = [];

	for (const provider of configuredProviders) {
		try {
			console.log(`Syncing tickets from ${provider.name}...`);
			const externalTickets = await provider.listTickets();
			const result = await syncProviderTickets(provider.name, externalTickets);
			results.push(result);
			console.log(
				`Synced ${provider.name}: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			results.push({
				provider: provider.name,
				created: 0,
				updated: 0,
				errors: [`Provider sync failed: ${message}`],
			});
		}
	}

	return {
		results,
		totalCreated: results.reduce((sum, r) => sum + r.created, 0),
		totalUpdated: results.reduce((sum, r) => sum + r.updated, 0),
		totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
	};
}

/**
 * Sync tickets from a specific provider
 */
export async function syncProvider(
	providerKey: TicketProvider,
): Promise<SyncResult> {
	const registry = getProviderRegistry();
	const provider = registry.getProvider(providerKey);

	if (!provider) {
		return {
			provider: providerKey,
			created: 0,
			updated: 0,
			errors: [`Provider ${providerKey} not found`],
		};
	}

	if (!provider.isConfigured()) {
		return {
			provider: providerKey,
			created: 0,
			updated: 0,
			errors: [`Provider ${providerKey} is not configured`],
		};
	}

	const externalTickets = await provider.listTickets();
	return syncProviderTickets(providerKey, externalTickets);
}

/**
 * Create a manual ticket (not from any provider)
 */
export async function createManualTicket(input: {
	title: string;
	description?: string | null;
	priority?: "low" | "medium" | "high" | "urgent";
	assignee?: string | null;
	labels?: string[];
}): Promise<typeof tickets.$inferSelect> {
	const result = await db
		.insert(tickets)
		.values({
			provider: "manual",
			title: input.title,
			description: input.description ?? null,
			priority: input.priority ?? "medium",
			assignee: input.assignee ?? null,
			labels: input.labels ?? [],
			status: "open",
		})
		.returning();

	return result[0] as typeof tickets.$inferSelect;
}

