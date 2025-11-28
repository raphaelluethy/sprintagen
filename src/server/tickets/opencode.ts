import { eq } from "drizzle-orm";
import { env } from "@/env";
import { fetchFromOpencode } from "@/lib/opencode";
import { db } from "@/server/db";
import { tickets } from "@/server/db/schema";

/**
 * Opencode message part types - matching admin/chats structure
 */
interface TextPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "text";
	text: string;
	synthetic?: boolean;
	ignored?: boolean;
	time?: {
		start: number;
		end?: number;
	};
	metadata?: Record<string, unknown>;
}

interface ReasoningPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "reasoning";
	text: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
		end?: number;
	};
}

interface ToolStatePending {
	status: "pending";
	input: Record<string, unknown>;
	raw: string;
}

interface ToolStateRunning {
	status: "running";
	input: Record<string, unknown>;
	title?: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
	};
}

interface ToolStateCompleted {
	status: "completed";
	input: Record<string, unknown>;
	output: string;
	title: string;
	metadata: Record<string, unknown>;
	time: {
		start: number;
		end: number;
		compacted?: number;
	};
}

interface ToolStateError {
	status: "error";
	input: Record<string, unknown>;
	error: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
		end: number;
	};
}

export type ToolState =
	| ToolStatePending
	| ToolStateRunning
	| ToolStateCompleted
	| ToolStateError;

interface ToolPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "tool";
	callID: string;
	tool: string;
	state: ToolState;
	metadata?: Record<string, unknown>;
}

interface StepStartPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "step-start";
	snapshot?: string;
}

interface StepFinishPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "step-finish";
	reason: string;
	snapshot?: string;
	cost: number;
	tokens: {
		input: number;
		output: number;
		reasoning: number;
		cache: {
			read: number;
			write: number;
		};
	};
}

interface FilePart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "file";
	mime: string;
	filename?: string;
	url: string;
}

export type MessagePart =
	| TextPart
	| ReasoningPart
	| ToolPart
	| StepStartPart
	| StepFinishPart
	| FilePart;

// Export types for frontend use
export type { ToolPart, ReasoningPart };

/**
 * Opencode message structure
 */
interface OpencodeMessage {
	info: {
		id: string;
		sessionID: string;
		role: "user" | "assistant";
		createdAt: number;
		model?: {
			providerID: string;
			modelID: string;
		};
	};
	parts: MessagePart[];
}

/**
 * Opencode session structure
 */
interface OpencodeSession {
	id: string;
	title?: string;
	parentID?: string;
	createdAt: number;
}

/**
 * Chat message DTO for the frontend
 */
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
	// Full parts array for rendering steps/tools/reasoning
	parts?: MessagePart[];
	// Reasoning text if available
	reasoning?: string;
	// Session ID this message belongs to - used for session boundary detection
	sessionId?: string;
}

/**
 * Result type for operations that can fail gracefully
 */
export type OpencodeResult<T> =
	| { success: true; data: T }
	| { success: false; error: string };

/**
 * Ticket metadata with optional opencode session ID
 */
interface TicketMetadata {
	opencodeSessionId?: string;
	[key: string]: unknown;
}

/**
 * Check if Opencode server is available
 */
export async function checkOpencodeHealth(): Promise<boolean> {
	try {
		const response = await fetchFromOpencode("/agent", {
			method: "GET",
			headers: { "Content-Type": "application/json" },
		});
		console.log("[OPENCODE] Health check response:", response);
		if (env.FAST_MODE) {
			console.log("[OPENCODE] Fast mode is enabled");
		}
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Check if an Opencode session exists
 * Returns true if session exists, false if it doesn't
 * Assumes Opencode server is healthy (caller should check health separately if needed)
 */
async function sessionExists(sessionId: string): Promise<boolean> {
	try {
		const response = await fetchFromOpencode(`/session/${sessionId}/message`, {
			method: "GET",
			headers: { "Content-Type": "application/json" },
		});

		// Session doesn't exist
		if (response.status === 404 || response.status === 410) {
			console.log(`[OPENCODE] Session ${sessionId} not found`);
			return false;
		}

		// Check for error responses that indicate session doesn't exist
		if (response.ok) {
			const data = await response.json();
			if (
				data.error ||
				(data.data?.message &&
					typeof data.data.message === "string" &&
					data.data.message.toLowerCase().includes("not found"))
			) {
				console.log(
					`[OPENCODE] Session ${sessionId} not found (error in response)`,
				);
				return false;
			}
		}

		return response.ok;
	} catch (error) {
		// Any error fetching the session means it doesn't exist (or is inaccessible)
		const message = error instanceof Error ? error.message : String(error);
		console.log(`[OPENCODE] Session ${sessionId} not found (${message})`);
		return false;
	}
}

/**
 * Clear stale session ID from ticket metadata
 */
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
 * Pure lookup helper: returns the current valid opencodeSessionId from ticket metadata
 * or null if there is no valid session. Never creates a new session.
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

		// No stored session ID
		if (!metadata.opencodeSessionId) {
			return { success: true, data: { sessionId: null } };
		}

		// Validate the session exists
		const exists = await sessionExists(metadata.opencodeSessionId);

		if (exists) {
			console.log(
				`[OPENCODE] Lookup found valid session ${metadata.opencodeSessionId} for ticket ${ticketId}`,
			);
			return { success: true, data: { sessionId: metadata.opencodeSessionId } };
		}

		// Session is stale - clear it and return null
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
 * Always create a fresh Opencode session for a ticket, overwriting any previous session ID.
 * Returns the new session ID.
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

		// Create a new session
		console.log(
			`[OPENCODE] Creating fresh session for ticket ${ticketId}${oldSessionId ? ` (replacing ${oldSessionId})` : ""}`,
		);
		const response = await fetchFromOpencode("/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: `Ticket: ${ticketTitle} (${ticketId})`,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			return {
				success: false,
				error: `Failed to create Opencode session: ${errorText}`,
			};
		}

		const session = (await response.json()) as OpencodeSession;

		// Persist the new session ID to the ticket's metadata (overwriting old)
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
 * Get or create an Opencode session for a ticket
 * Validates existing sessions and recreates them if they're stale (e.g., after Opencode restart)
 */
export async function getOrCreateOpencodeSession(
	ticketId: string,
	ticketTitle: string,
): Promise<OpencodeResult<{ sessionId: string; isNew: boolean }>> {
	try {
		// Get ticket to check for existing session
		const ticket = await db.query.tickets.findFirst({
			where: eq(tickets.id, ticketId),
		});

		if (!ticket) {
			return { success: false, error: "Ticket not found" };
		}

		let metadata = (ticket.metadata ?? {}) as TicketMetadata;

		// If we have a stored session ID, check if it still exists
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

			// Session doesn't exist - clear the stored ID and create a new one
			console.log(
				`[OPENCODE] Session ${metadata.opencodeSessionId} doesn't exist, creating new session for ticket ${ticketId}`,
			);
			await clearStaleSessionId(ticketId);

			// Re-fetch metadata after clearing
			const updatedTicket = await db.query.tickets.findFirst({
				where: eq(tickets.id, ticketId),
			});
			metadata = (updatedTicket?.metadata ?? {}) as TicketMetadata;
		}

		// Create a new session
		console.log(`[OPENCODE] Creating new session for ticket ${ticketId}`);
		const response = await fetchFromOpencode("/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: `Ticket: ${ticketTitle} (${ticketId})`,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			return {
				success: false,
				error: `Failed to create Opencode session: ${errorText}`,
			};
		}

		const session = (await response.json()) as OpencodeSession;

		// Persist the session ID to the ticket's metadata atomically
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
			// Fallback - session was created but metadata update failed
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
 * Extract text content from Opencode message parts
 */
function extractTextFromParts(parts: MessagePart[]): string {
	return parts
		.filter((p): p is TextPart => p.type === "text")
		.map((p) => p.text)
		.join("\n");
}

/**
 * Extract reasoning content from Opencode message parts
 */
function extractReasoningFromParts(parts: MessagePart[]): string {
	return parts
		.filter((p): p is ReasoningPart => p.type === "reasoning")
		.map((p) => p.text)
		.join("\n")
		.trim();
}

/**
 * Extract tool calls from Opencode message parts (for backward compatibility)
 */
function extractToolCalls(
	parts: MessagePart[],
): { toolName: string; toolCallId: string }[] {
	return parts
		.filter((p): p is ToolPart => p.type === "tool")
		.map((p) => ({ toolName: p.tool, toolCallId: p.callID }));
}

/**
 * Map Opencode message to chat DTO
 */
function mapToOpencodeChatMessage(
	msg: OpencodeMessage | null | undefined,
): OpencodeChatMessage | null {
	if (!msg || !msg.info) {
		return null;
	}

	const parts = msg.parts ?? [];
	const reasoning = extractReasoningFromParts(parts);
	return {
		id: msg.info.id,
		role: msg.info.role,
		text: extractTextFromParts(parts),
		createdAt: new Date(msg.info.createdAt),
		model: msg.info.model
			? `${msg.info.model.providerID}/${msg.info.model.modelID}`
			: undefined,
		toolCalls: extractToolCalls(parts),
		// Include full parts for step/tool rendering
		parts: parts.length > 0 ? parts : undefined,
		// Include reasoning if available
		reasoning: reasoning || undefined,
		// Include session ID for session boundary detection
		sessionId: msg.info.sessionID,
	};
}

/**
 * Result type for getOpencodeMessages that includes session info
 */
export interface OpencodeMessagesResult {
	messages: OpencodeChatMessage[];
	currentSessionId: string;
	isNewSession: boolean;
}

/**
 * Get chat messages for a ticket's Opencode session.
 * Uses lookup-only behavior: if there is no valid session, returns empty messages
 * without creating a new session. This prevents implicit session creation on read.
 *
 * Optionally accepts an explicit sessionId to fetch messages from a specific session
 * (used when the UI holds a session ID in local state).
 */
export async function getOpencodeMessages(
	ticketId: string,
	_ticketTitle: string,
	explicitSessionId?: string,
): Promise<OpencodeResult<OpencodeMessagesResult>> {
	let sessionId: string | null = explicitSessionId ?? null;

	// If no explicit session provided, look up from ticket metadata (read-only)
	if (!sessionId) {
		const lookupResult = await lookupExistingOpencodeSession(ticketId);
		if (!lookupResult.success) {
			return lookupResult;
		}
		sessionId = lookupResult.data.sessionId;
	}

	// No valid session - return empty messages without creating one
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
		const response = await fetchFromOpencode(`/session/${sessionId}/message`, {
			method: "GET",
			headers: { "Content-Type": "application/json" },
		});

		if (!response.ok) {
			return {
				success: false,
				error: `Failed to fetch messages: ${response.status}`,
			};
		}

		const responseData = await response.json();

		// Check if the response is an error object (Opencode may return errors with 200 status)
		if (
			responseData.error ||
			(responseData.data?.message && !Array.isArray(responseData))
		) {
			const errorMessage =
				responseData.data?.message ||
				responseData.message ||
				responseData.error ||
				"Opencode returned an error";
			return {
				success: false,
				error: errorMessage,
			};
		}

		// Handle case where response might be wrapped in a data property
		const messagesArray = responseData.data || responseData;
		if (!Array.isArray(messagesArray)) {
			return {
				success: false,
				error: "Invalid response format from Opencode",
			};
		}

		const messages = messagesArray as OpencodeMessage[];
		const mapped = messages
			.map(mapToOpencodeChatMessage)
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
 * Result type for sendOpencodeMessage that includes session info
 */
export interface OpencodeMessageResult {
	message: OpencodeChatMessage;
	sessionId: string;
	isNewSession: boolean;
}

/**
 * Send a message to a ticket's Opencode session.
 * Optionally accepts an explicit sessionId - when provided, sends into that session
 * without consulting/updating ticket metadata.
 * When not provided, falls back to getOrCreateOpencodeSession for legacy flows.
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
		// Use the explicit session ID directly (UI-managed session)
		sessionId = explicitSessionId;
		console.log(
			`[OPENCODE] Sending message to explicit session ${sessionId} for ticket ${ticketId}`,
		);
	} else {
		// Legacy flow: ensure session exists via getOrCreateOpencodeSession
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
		// Build the message payload
		const payload: {
			agent?: string;
			model?: { providerID: string; modelID: string };
			parts: { type: "text"; text: string }[];
		} = {
			agent: "docs-agent",
			parts: [{ type: "text", text: userMessage }],
		};

		// Use provided model if both providerID and modelID are set,
		// otherwise default to big-pickle for ticket flows
		if (env.FAST_MODE) {
			payload.model = {
				providerID: "cerebras",
				modelID: "zai-glm-4.6",
			};
		} else {
			// Default to big-pickle for ticket Opencode calls
			payload.model = {
				providerID: "opencode",
				modelID: "big-pickle",
			};
		}

		const response = await fetchFromOpencode(`/session/${sessionId}/message`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			return {
				success: false,
				error: `Failed to send message: ${errorText}`,
			};
		}

		const responseData = await response.json();

		// Check if the response is an error object (Opencode may return errors with 200 status)
		if (
			responseData.error ||
			(responseData.data?.message && !responseData.info)
		) {
			const errorMessage =
				responseData.data?.message ||
				responseData.message ||
				responseData.error ||
				"Opencode returned an error";
			return {
				success: false,
				error: errorMessage,
			};
		}

		// Handle case where response might be wrapped in a data property
		const messageData = responseData.data || responseData;
		if (!messageData || !messageData.info) {
			return {
				success: false,
				error: "Invalid response format from Opencode",
			};
		}

		const assistantMessage = messageData as OpencodeMessage;
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
 * Result type for askOpencodeQuestion that includes session info
 */
export interface OpencodeQuestionResult {
	answer: string;
	sessionId: string;
	isNewSession: boolean;
}

/**
 * Send a prompt to Opencode and extract plain text response.
 * ALWAYS creates a fresh session for each call - each "Ask Opencode" click
 * starts a brand new Opencode run, even for the same ticket.
 */
export async function askOpencodeQuestion(
	ticketId: string,
	ticketTitle: string,
	prompt: string,
): Promise<OpencodeResult<OpencodeQuestionResult>> {
	// Always create a fresh session for each Ask Opencode call
	const sessionResult = await createNewOpencodeSessionForTicket(
		ticketId,
		ticketTitle,
	);
	if (!sessionResult.success) {
		return sessionResult;
	}

	const { sessionId } = sessionResult.data;

	// Send the message into the fresh session
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
			isNewSession: true, // Always true since we always create fresh
		},
	};
}
