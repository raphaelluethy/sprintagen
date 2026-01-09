import type {
	Message,
	Part,
	ReasoningPart,
	Session,
	ToolPart,
} from "@opencode-ai/sdk";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { getOpencodeClient } from "@/lib/opencode-client";
import { getDefaultModel } from "@/server/ai-agents/model-selector";
import { db } from "@/server/db";
import { opencodeSessionsTable, tickets } from "@/server/db/schema";
import {
	type TransformedMessage,
	transformMessage,
} from "@/server/opencode/message-utils";

export type MessagePart = Part;
export type { ToolPart, ReasoningPart };

export type OpencodeMessage = {
	info: Message;
	parts: Part[];
};

// Re-export for backwards compatibility
export type OpencodeChatMessage = TransformedMessage;

export type OpencodeResult<T> =
	| { success: true; data: T }
	| { success: false; error: string };

interface TicketMetadata {
	opencodeSessionId?: string;
	[key: string]: unknown;
}

function mapToOpencodeChatMessage(
	msg: OpencodeMessage | null | undefined,
): OpencodeChatMessage | null {
	if (!msg || !msg.info) {
		return null;
	}

	return transformMessage(msg.info, msg.parts ?? []);
}

export interface OpencodeMessagesResult {
	messages: OpencodeChatMessage[];
	currentSessionId: string;
	isNewSession: boolean;
}

export interface OpencodeMessageResult {
	message: OpencodeChatMessage;
	sessionId: string;
	isNewSession: boolean;
}

export interface OpencodeQuestionResult {
	answer: string;
	sessionId: string;
	isNewSession: boolean;
}

export async function checkOpencodeHealth(): Promise<boolean> {
	try {
		const client = getOpencodeClient();
		const result = await client.app.agents();
		if (env.FAST_MODE) {
			console.log("[OPENCODE] Fast mode is enabled");
		}
		return Boolean(result.data);
	} catch {
		return false;
	}
}

async function sessionExists(sessionId: string): Promise<boolean> {
	try {
		const client = getOpencodeClient();
		const result = await client.session.messages({
			path: { id: sessionId },
			query: { limit: 1 },
		});

		if (result.response?.status === 404 || result.response?.status === 410) {
			return false;
		}

		return Boolean(result.response?.ok && result.data);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.log(`[OPENCODE] Session ${sessionId} not found (${message})`);
		return false;
	}
}

async function clearStaleSessionId(ticketId: string): Promise<void> {
	const ticket = await db.query.tickets.findFirst({
		where: eq(tickets.id, ticketId),
	});

	if (!ticket) return;

	const metadata = (ticket.metadata ?? {}) as TicketMetadata;
	const { opencodeSessionId: _, ...rest } = metadata;

	await db
		.update(tickets)
		.set({ metadata: rest })
		.where(eq(tickets.id, ticketId));

	console.log(`[OPENCODE] Cleared stale session ID for ticket ${ticketId}`);
}

/**
 * @deprecated Use `opencodeTicketService.getOrCreateSession` from `@/server/tickets/opencode-service` instead.
 * This function will be removed after router migration is complete.
 */
export async function lookupExistingOpencodeSession(
	ticketId: string,
): Promise<OpencodeResult<{ sessionId: string | null }>> {
	try {
		const ticket = await db.query.tickets.findFirst({
			where: eq(tickets.id, ticketId),
		});

		if (!ticket) {
			return { success: false, error: "Ticket not found" };
		}

		const metadata = (ticket.metadata ?? {}) as TicketMetadata;

		if (!metadata.opencodeSessionId) {
			return { success: true, data: { sessionId: null } };
		}

		const exists = await sessionExists(metadata.opencodeSessionId);

		if (exists) {
			console.log(
				`[OPENCODE] Lookup found valid session ${metadata.opencodeSessionId} for ticket ${ticketId}`,
			);
			return { success: true, data: { sessionId: metadata.opencodeSessionId } };
		}

		console.log(
			`[OPENCODE] Lookup found stale session ${metadata.opencodeSessionId} for ticket ${ticketId}, clearing`,
		);
		await clearStaleSessionId(ticketId);
		return { success: true, data: { sessionId: null } };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return { success: false, error: message };
	}
}

/**
 * @deprecated Use `opencodeTicketService.startSession` from `@/server/tickets/opencode-service` instead.
 * This function will be removed after router migration is complete.
 */
export async function createNewOpencodeSessionForTicket(
	ticketId: string,
	ticketTitle: string,
): Promise<OpencodeResult<{ sessionId: string }>> {
	try {
		const ticket = await db.query.tickets.findFirst({
			where: eq(tickets.id, ticketId),
		});

		if (!ticket) {
			return { success: false, error: "Ticket not found" };
		}

		const metadata = (ticket.metadata ?? {}) as TicketMetadata;
		const oldSessionId = metadata.opencodeSessionId;

		console.log(
			`[OPENCODE] Creating fresh session for ticket ${ticketId}${oldSessionId ? ` (replacing ${oldSessionId})` : ""}`,
		);

		const client = getOpencodeClient();
		const result = await client.session.create({
			body: {
				title: `Ticket: ${ticketTitle} (${ticketId})`,
			},
		});

		if (!result.data) {
			const detail = result.error
				? JSON.stringify(result.error)
				: "Unknown error";
			return {
				success: false,
				error: `Failed to create Opencode session: ${detail}`,
			};
		}

		const session = result.data as Session;

		const [updatedTicket] = await db
			.update(tickets)
			.set({
				metadata: {
					...metadata,
					opencodeSessionId: session.id,
				},
			})
			.where(eq(tickets.id, ticketId))
			.returning();

		if (!updatedTicket) {
			console.warn(
				`[OPENCODE] Created session ${session.id} but failed to persist to ticket ${ticketId}`,
			);
		}

		console.log(
			`[OPENCODE] Created fresh session ${session.id} for ticket ${ticketId}`,
		);
		return { success: true, data: { sessionId: session.id } };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return { success: false, error: message };
	}
}

/**
 * @deprecated Use `opencodeTicketService.getOrCreateSession` from `@/server/tickets/opencode-service` instead.
 * This function will be removed after router migration is complete.
 */
export async function getOrCreateOpencodeSession(
	ticketId: string,
	ticketTitle: string,
): Promise<OpencodeResult<{ sessionId: string; isNew: boolean }>> {
	try {
		const ticket = await db.query.tickets.findFirst({
			where: eq(tickets.id, ticketId),
		});

		if (!ticket) {
			return { success: false, error: "Ticket not found" };
		}

		let metadata = (ticket.metadata ?? {}) as TicketMetadata;

		if (metadata.opencodeSessionId) {
			const exists = await sessionExists(metadata.opencodeSessionId);

			if (exists) {
				console.log(
					`[OPENCODE] Reusing session ${metadata.opencodeSessionId} for ticket ${ticketId}`,
				);
				return {
					success: true,
					data: { sessionId: metadata.opencodeSessionId, isNew: false },
				};
			}

			console.log(
				`[OPENCODE] Session ${metadata.opencodeSessionId} doesn't exist, creating new session for ticket ${ticketId}`,
			);
			await clearStaleSessionId(ticketId);

			const updatedTicket = await db.query.tickets.findFirst({
				where: eq(tickets.id, ticketId),
			});
			metadata = (updatedTicket?.metadata ?? {}) as TicketMetadata;
		}

		console.log(`[OPENCODE] Creating new session for ticket ${ticketId}`);
		const client = getOpencodeClient();
		const result = await client.session.create({
			body: {
				title: `Ticket: ${ticketTitle} (${ticketId})`,
			},
		});

		if (!result.data) {
			const detail = result.error
				? JSON.stringify(result.error)
				: "Unknown error";
			return {
				success: false,
				error: `Failed to create Opencode session: ${detail}`,
			};
		}

		const session = result.data as Session;

		const [updatedTicket] = await db
			.update(tickets)
			.set({
				metadata: {
					...metadata,
					opencodeSessionId: session.id,
				},
			})
			.where(eq(tickets.id, ticketId))
			.returning();

		if (!updatedTicket) {
			console.warn(
				`[OPENCODE] Created session ${session.id} but failed to persist to ticket ${ticketId}`,
			);
		}

		console.log(
			`[OPENCODE] Created new session ${session.id} for ticket ${ticketId}`,
		);
		return { success: true, data: { sessionId: session.id, isNew: true } };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return { success: false, error: message };
	}
}

/**
 * @deprecated Use `opencodeTicketService.getChat` from `@/server/tickets/opencode-service` instead.
 * This function will be removed after router migration is complete.
 */
export async function getOpencodeMessages(
	ticketId: string,
	_ticketTitle: string,
	explicitSessionId?: string,
): Promise<OpencodeResult<OpencodeMessagesResult>> {
	let sessionId: string | null = explicitSessionId ?? null;

	if (!sessionId) {
		const lookupResult = await lookupExistingOpencodeSession(ticketId);
		if (!lookupResult.success) {
			return lookupResult;
		}
		sessionId = lookupResult.data.sessionId;
	}

	if (!sessionId) {
		return {
			success: true,
			data: {
				messages: [],
				currentSessionId: "",
				isNewSession: false,
			},
		};
	}

	try {
		const client = getOpencodeClient();
		const result = await client.session.messages({ path: { id: sessionId } });

		if (!result.data) {
			const status = result.response?.status ?? 500;
			return {
				success: false,
				error: `Failed to fetch messages: ${status}`,
			};
		}

		const mapped = result.data
			.map((message) => mapToOpencodeChatMessage(message))
			.filter((msg): msg is OpencodeChatMessage => msg !== null);

		return {
			success: true,
			data: {
				messages: mapped,
				currentSessionId: sessionId,
				isNewSession: false,
			},
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return { success: false, error: message };
	}
}

/**
 * @deprecated Use `opencodeTicketService.sendMessage` from `@/server/tickets/opencode-service` instead.
 * This function will be removed after router migration is complete.
 */
export async function sendOpencodeMessage(
	ticketId: string,
	ticketTitle: string,
	userMessage: string,
	explicitSessionId?: string,
): Promise<OpencodeResult<OpencodeMessageResult>> {
	let sessionId: string;
	let isNew = false;

	if (explicitSessionId) {
		sessionId = explicitSessionId;
		console.log(
			`[OPENCODE] Sending message to explicit session ${sessionId} for ticket ${ticketId}`,
		);
	} else {
		const sessionResult = await getOrCreateOpencodeSession(
			ticketId,
			ticketTitle,
		);
		if (!sessionResult.success) {
			return sessionResult;
		}
		sessionId = sessionResult.data.sessionId;
		isNew = sessionResult.data.isNew;
	}

	try {
		const model = getDefaultModel();
		const payload = {
			agent: "docs-agent",
			parts: [{ type: "text" as const, text: userMessage }],
			model: {
				providerID: model.providerId,
				modelID: model.modelId,
			},
		};

		const client = getOpencodeClient();
		const result = await client.session.prompt({
			path: { id: sessionId },
			body: payload,
		});

		if (!result.data) {
			const detail = result.error
				? JSON.stringify(result.error)
				: "Unknown error";
			return {
				success: false,
				error: `Failed to send message: ${detail}`,
			};
		}

		const assistantMessage: OpencodeMessage = {
			info: result.data.info,
			parts: result.data.parts,
		};

		const mapped = mapToOpencodeChatMessage(assistantMessage);

		if (!mapped) {
			return {
				success: false,
				error: "Failed to map Opencode message response",
			};
		}

		return {
			success: true,
			data: {
				message: mapped,
				sessionId,
				isNewSession: isNew,
			},
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return { success: false, error: message };
	}
}

/**
 * @deprecated Use `opencodeTicketService.sendMessage` from `@/server/tickets/opencode-service` instead.
 * This function will be removed after router migration is complete.
 */
export async function askOpencodeQuestion(
	ticketId: string,
	ticketTitle: string,
	prompt: string,
): Promise<OpencodeResult<OpencodeQuestionResult>> {
	const sessionResult = await createNewOpencodeSessionForTicket(
		ticketId,
		ticketTitle,
	);
	if (!sessionResult.success) {
		return sessionResult;
	}

	const { sessionId } = sessionResult.data;

	const result = await sendOpencodeMessage(
		ticketId,
		ticketTitle,
		prompt,
		sessionId,
	);

	if (!result.success) {
		return result;
	}

	return {
		success: true,
		data: {
			answer: result.data.message.text,
			sessionId: result.data.sessionId,
			isNewSession: true,
		},
	};
}

/**
 * Persist OpenCode session data to the database
 * This allows historical viewing of sessions and their messages
 * @deprecated This function may be removed in a future release.
 */
export async function persistOpencodeSession(
	sessionId: string,
	ticketId: string,
	sessionType: "chat" | "ask" | "admin",
	status: "pending" | "running" | "completed" | "error",
	messages: OpencodeChatMessage[],
	errorMessage?: string,
): Promise<OpencodeResult<{ persisted: boolean }>> {
	try {
		const now = new Date();

		// Check if session already exists
		const existing = await db.query.opencodeSessionsTable.findFirst({
			where: eq(opencodeSessionsTable.id, sessionId),
		});

		if (existing) {
			// Update existing session
			await db
				.update(opencodeSessionsTable)
				.set({
					status,
					messages: messages as unknown[],
					completedAt:
						status === "completed" || status === "error" ? now : null,
					errorMessage: errorMessage ?? null,
				})
				.where(eq(opencodeSessionsTable.id, sessionId));
		} else {
			// Insert new session
			await db.insert(opencodeSessionsTable).values({
				id: sessionId,
				ticketId,
				sessionType,
				status,
				messages: messages as unknown[],
				startedAt: now,
				completedAt: status === "completed" || status === "error" ? now : null,
				errorMessage: errorMessage ?? null,
				metadata: {},
			});
		}

		console.log(
			`[OPENCODE] Persisted session ${sessionId} with ${messages.length} messages (status: ${status})`,
		);
		return { success: true, data: { persisted: true } };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		console.error(`[OPENCODE] Failed to persist session ${sessionId}:`, error);
		return { success: false, error: message };
	}
}

/**
 * Get all persisted sessions for a ticket
 * @deprecated This function may be removed in a future release.
 */
export async function getPersistedSessions(ticketId: string): Promise<
	OpencodeResult<
		{
			sessionId: string;
			sessionType: "chat" | "ask" | "admin";
			status: "pending" | "running" | "completed" | "error";
			messages: OpencodeChatMessage[];
			startedAt: Date;
			completedAt: Date | null;
			errorMessage: string | null;
		}[]
	>
> {
	try {
		const sessions = await db.query.opencodeSessionsTable.findMany({
			where: eq(opencodeSessionsTable.ticketId, ticketId),
			orderBy: (t, { desc }) => desc(t.startedAt),
		});

		return {
			success: true,
			data: sessions.map((s) => ({
				sessionId: s.id,
				sessionType: s.sessionType,
				status: s.status,
				messages: (s.messages ?? []) as OpencodeChatMessage[],
				startedAt: s.startedAt,
				completedAt: s.completedAt,
				errorMessage: s.errorMessage,
			})),
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return { success: false, error: message };
	}
}
