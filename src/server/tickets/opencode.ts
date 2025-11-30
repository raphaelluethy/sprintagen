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
import { db } from "@/server/db";
import { tickets } from "@/server/db/schema";

export type MessagePart = Part;
export type { ToolPart, ReasoningPart };

export type OpencodeMessage = {
	info: Message;
	parts: Part[];
};

export interface OpencodeChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	createdAt: Date;
	model?: string;
	toolCalls?: {
		toolName: string;
		toolCallId: string;
	}[];
	parts?: MessagePart[];
	reasoning?: string;
	sessionId?: string;
}

export type OpencodeResult<T> =
	| { success: true; data: T }
	| { success: false; error: string };

interface TicketMetadata {
	opencodeSessionId?: string;
	[key: string]: unknown;
}

function extractTextFromParts(parts: Part[]): string {
	const textParts = parts
		.filter(
			(part): part is Extract<Part, { type: "text" }> => part.type === "text",
		)
		.map((part) => part.text);

	const stepFinishParts = parts
		.filter(
			(part): part is Extract<Part, { type: "step-finish" }> =>
				part.type === "step-finish",
		)
		.map((part) => part.reason);

	const fileParts = parts
		.filter(
			(part): part is Extract<Part, { type: "file" }> => part.type === "file",
		)
		.map((part) => {
			// @ts-expect-error - SDK types might be incomplete in our view
			const content = part.content ?? part.data ?? "";
			// @ts-expect-error - SDK types might be incomplete in our view
			const mimeType = part.mimeType ?? "application/octet-stream";
			return `[File: ${mimeType}]\n${content}`;
		});

	return [...textParts, ...fileParts, ...stepFinishParts].join("\n");
}

function extractReasoningFromParts(parts: Part[]): string {
	return parts
		.filter(
			(part): part is Extract<Part, { type: "reasoning" }> =>
				part.type === "reasoning",
		)
		.map((part) => part.text)
		.join("\n")
		.trim();
}

function extractToolCalls(
	parts: Part[],
): { toolName: string; toolCallId: string }[] {
	return parts
		.filter((part): part is ToolPart => part.type === "tool")
		.map((part) => ({ toolName: part.tool, toolCallId: part.callID }));
}

function getModelLabel(message: Message): string | undefined {
	if ("model" in message && message.model) {
		return `${message.model.providerID}/${message.model.modelID}`;
	}

	if ("providerID" in message && "modelID" in message) {
		return `${message.providerID}/${message.modelID}`;
	}

	return undefined;
}

function getCreatedAt(message: Message): Date {
	const time =
		(message as { time?: { created?: number; completed?: number } }).time ?? {};
	const timestamp = time.created ?? time.completed ?? Date.now();
	return new Date(timestamp);
}

function mapToOpencodeChatMessage(
	msg: OpencodeMessage | null | undefined,
): OpencodeChatMessage | null {
	if (!msg || !msg.info) {
		return null;
	}

	const parts = msg.parts ?? [];
	console.log(
		`[OPENCODE] Processing message ${msg.info.id} parts:`,
		JSON.stringify(parts, null, 2),
	);
	const reasoning = extractReasoningFromParts(parts);
	return {
		id: msg.info.id,
		role: msg.info.role,
		text: extractTextFromParts(parts),
		createdAt: getCreatedAt(msg.info),
		model: getModelLabel(msg.info),
		toolCalls: extractToolCalls(parts),
		parts: parts.length > 0 ? parts : undefined,
		reasoning: reasoning || undefined,
		sessionId: msg.info.sessionID,
	};
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
		const payload = {
			agent: "docs-agent",
			parts: [{ type: "text" as const, text: userMessage }],
			model: env.FAST_MODE
				? {
						providerID: "cerebras",
						modelID: "zai-glm-4.6",
					}
				: {
						providerID: "opencode",
						modelID: "big-pickle",
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
