/**
 * Redis storage for OpenCode SDK events
 *
 * Stores sessions, messages, parts, status, diffs, and todos using Redis.
 * Uses sorted sets for ordered data and hashes for key-value lookups.
 */

import type {
	Event,
	FileDiff,
	Message,
	Part,
	Session,
	SessionStatus,
	Todo,
} from "@opencode-ai/sdk";
import { isRedisAvailable, redis, scanKeys } from "./index";

// Redis key patterns for OpenCode data
export const OpencodeKeys = {
	// Session data
	session: (id: string) => `oc:session:${id}`,
	sessionList: () => "oc:sessions",

	// Messages per session (sorted set by message ID for ordering)
	messages: (sessionId: string) => `oc:session:${sessionId}:messages`,
	message: (sessionId: string, messageId: string) =>
		`oc:session:${sessionId}:message:${messageId}`,

	// Parts per message (sorted set by part ID for ordering)
	parts: (messageId: string) => `oc:message:${messageId}:parts`,
	part: (messageId: string, partId: string) =>
		`oc:message:${messageId}:part:${partId}`,

	// Session status
	status: (sessionId: string) => `oc:session:${sessionId}:status`,

	// Session diffs
	diff: (sessionId: string) => `oc:session:${sessionId}:diff`,

	// Session todos
	todos: (sessionId: string) => `oc:session:${sessionId}:todos`,

	// Active session lookup by ticket
	activeSession: (ticketId: string) => `oc:ticket:${ticketId}:active`,

	// Event pub/sub channels
	sessionEvents: (sessionId: string) => `oc:events:session:${sessionId}`,
	globalEvents: () => "oc:events:global",
} as const;

/**
 * Extended session state stored in Redis
 */
export interface StoredSessionState {
	session: Session;
	ticketId?: string;
	sessionType: "chat" | "ask" | "admin";
	status: SessionStatus;
	startedAt: number;
	updatedAt: number;
}

/**
 * OpenCode Redis Store
 *
 * Handles storage and retrieval of OpenCode SDK data
 */
export class OpencodeRedisStore {
	/**
	 * Handle an incoming SDK event and update the store
	 */
	async handleEvent(event: Event): Promise<void> {
		if (!isRedisAvailable()) {
			console.warn("[OC-STORE] Redis not available, skipping event");
			return;
		}

		switch (event.type) {
			case "session.created":
			case "session.updated":
				await this.upsertSession(event.properties.info);
				break;

			case "session.deleted":
				await this.deleteSession(event.properties.info.id);
				break;

			case "session.status":
				await this.updateStatus(
					event.properties.sessionID,
					event.properties.status,
				);
				break;

			case "session.diff":
				await this.updateDiff(
					event.properties.sessionID,
					event.properties.diff,
				);
				break;

			case "message.updated":
				await this.upsertMessage(event.properties.info);
				break;

			case "message.removed":
				await this.deleteMessage(
					event.properties.sessionID,
					event.properties.messageID,
				);
				break;

			case "message.part.updated": {
				const rawPart = event.properties.part as Part & { delta?: string };
				const delta =
					(event.properties as { delta?: string }).delta ?? rawPart.delta;
				const partWithDelta =
					delta !== undefined ? { ...rawPart, delta } : rawPart;
				await this.upsertPart(partWithDelta);
				break;
			}

			case "message.part.removed":
				await this.deletePart(
					event.properties.messageID,
					event.properties.partID,
				);
				break;

			case "todo.updated":
				await this.updateTodos(
					event.properties.sessionID,
					event.properties.todos,
				);
				break;

			case "session.idle":
				await this.updateStatus(event.properties.sessionID, { type: "idle" });
				break;

			default:
				// Ignore other event types
				break;
		}
	}

	/**
	 * Publish an event to Redis pub/sub for real-time subscriptions
	 */
	async publishEvent(sessionId: string, event: Event): Promise<void> {
		if (!isRedisAvailable()) return;

		// Publish to session-specific channel
		await redis.publish(
			OpencodeKeys.sessionEvents(sessionId),
			JSON.stringify(event),
		);

		// Also publish to global channel
		await redis.publish(OpencodeKeys.globalEvents(), JSON.stringify(event));
	}

	// ========================================================================
	// Session Operations
	// ========================================================================

	async upsertSession(session: Session): Promise<void> {
		const key = OpencodeKeys.session(session.id);
		await redis.set(key, JSON.stringify(session));
		// Add to session list sorted set (score = updated time)
		// Note: We're using the simple redis wrapper which doesn't have zadd
		// For now, just store the session
		console.log(`[OC-STORE] Upserted session ${session.id}`);
	}

	async getSession(id: string): Promise<Session | null> {
		const key = OpencodeKeys.session(id);
		const data = await redis.get(key);
		if (!data) return null;
		return JSON.parse(data) as Session;
	}

	async deleteSession(id: string): Promise<void> {
		const key = OpencodeKeys.session(id);
		await redis.del(key);
		console.log(`[OC-STORE] Deleted session ${id}`);
	}

	/**
	 * Create a tracked session with ticket association
	 */
	async createTrackedSession(
		session: Session,
		options: {
			ticketId?: string;
			sessionType: "chat" | "ask" | "admin";
		},
	): Promise<void> {
		const now = Date.now();
		const state: StoredSessionState = {
			session,
			ticketId: options.ticketId,
			sessionType: options.sessionType,
			status: { type: "idle" },
			startedAt: now,
			updatedAt: now,
		};

		const key = OpencodeKeys.session(session.id);
		await redis.setex(key, 3600, JSON.stringify(state)); // 1 hour TTL

		// Set active session lookup for "ask" sessions
		if (options.ticketId && options.sessionType === "ask") {
			const activeKey = OpencodeKeys.activeSession(options.ticketId);
			await redis.setex(activeKey, 3600, session.id);
		}

		console.log(
			`[OC-STORE] Created tracked session ${session.id} (${options.sessionType})`,
		);
	}

	/**
	 * Get tracked session state (includes ticket association)
	 */
	async getTrackedSession(id: string): Promise<StoredSessionState | null> {
		const key = OpencodeKeys.session(id);
		const data = await redis.get(key);
		if (!data) return null;

		try {
			const parsed = JSON.parse(data);
			// Check if it's a tracked session (has sessionType) or just a Session
			if ("sessionType" in parsed) {
				return parsed as StoredSessionState;
			}
			// Convert plain Session to StoredSessionState
			return {
				session: parsed as Session,
				sessionType: "chat",
				status: { type: "idle" },
				startedAt: Date.now(),
				updatedAt: Date.now(),
			};
		} catch {
			return null;
		}
	}

	/**
	 * Get active session ID for a ticket
	 */
	async getActiveSessionForTicket(ticketId: string): Promise<string | null> {
		const key = OpencodeKeys.activeSession(ticketId);
		return redis.get(key);
	}

	// ========================================================================
	// Message Operations
	// ========================================================================

	async upsertMessage(message: Message): Promise<void> {
		const key = OpencodeKeys.message(message.sessionID, message.id);
		const data = JSON.stringify(message);
		const success = await redis.set(key, data);
		console.log(
			`[OC-STORE] Upserted message ${message.id} (role=${message.role}) in session ${message.sessionID} | key=${key} | success=${success} | size=${data.length}`,
		);
	}

	async getMessage(
		sessionId: string,
		messageId: string,
	): Promise<Message | null> {
		const key = OpencodeKeys.message(sessionId, messageId);
		const data = await redis.get(key);
		if (!data) return null;
		return JSON.parse(data) as Message;
	}

	async deleteMessage(sessionId: string, messageId: string): Promise<void> {
		const key = OpencodeKeys.message(sessionId, messageId);
		await redis.del(key);
		console.log(
			`[OC-STORE] Deleted message ${messageId} from session ${sessionId}`,
		);
	}

	/**
	 * Get all messages for a session
	 */
	async getMessages(sessionId: string): Promise<Message[]> {
		if (!isRedisAvailable()) {
			console.log(`[OC-STORE] getMessages(${sessionId}): Redis not available`);
			return [];
		}

		// Scan for all message keys in this session
		const pattern = `oc:session:${sessionId}:message:*`;
		const keys = await scanKeys(pattern);
		console.log(
			`[OC-STORE] getMessages(${sessionId}): Found ${keys.length} message keys matching ${pattern}`,
		);

		const messages: Message[] = [];
		for (const key of keys) {
			const data = await redis.get(key);
			if (data) {
				const msg = JSON.parse(data) as Message;
				messages.push(msg);
				console.log(
					`[OC-STORE] getMessages(${sessionId}): Loaded message ${msg.id} (role=${msg.role})`,
				);
			}
		}

		// Sort by ID (which is typically chronological)
		messages.sort((a, b) => a.id.localeCompare(b.id));
		console.log(
			`[OC-STORE] getMessages(${sessionId}): Returning ${messages.length} messages`,
		);
		return messages;
	}

	// ========================================================================
	// Part Operations
	// ========================================================================

	async upsertPart(part: Part): Promise<void> {
		const { delta: _delta, ...rest } = part as Part & { delta?: string };
		const existing = await this.getPart(part.messageID, part.id);

		let mergedPart: Part = { ...(existing ?? {}), ...rest } as Part;
		const delta = (part as { delta?: string }).delta;

		if (mergedPart.type === "text") {
			const baseText = (existing as { text?: string } | null)?.text ?? "";
			const incomingText = (part as { text?: string }).text ?? "";
			const text =
				delta !== undefined ? `${baseText}${delta}` : incomingText || baseText;
			mergedPart = { ...mergedPart, text };
		}

		const key = OpencodeKeys.part(mergedPart.messageID, mergedPart.id);
		const data = JSON.stringify(mergedPart);
		const success = await redis.set(key, data);

		// Log with type-specific details
		let details = `type=${mergedPart.type}`;
		if (mergedPart.type === "text") {
			const textPart = mergedPart as { text: string };
			details += `, text_len=${textPart.text.length}`;
		} else if (mergedPart.type === "tool") {
			const toolPart = mergedPart as {
				tool: string;
				state: { status: string };
			};
			details += `, tool=${toolPart.tool}, status=${toolPart.state.status}`;
		}

		console.log(
			`[OC-STORE] Upserted part ${mergedPart.id} | msg=${mergedPart.messageID} | ${details} | key=${key} | success=${success} | size=${data.length}`,
		);
	}

	async getPart(messageId: string, partId: string): Promise<Part | null> {
		const key = OpencodeKeys.part(messageId, partId);
		const data = await redis.get(key);
		if (!data) return null;
		return JSON.parse(data) as Part;
	}

	async deletePart(messageId: string, partId: string): Promise<void> {
		const key = OpencodeKeys.part(messageId, partId);
		await redis.del(key);
		console.log(`[OC-STORE] Deleted part ${partId} from message ${messageId}`);
	}

	/**
	 * Get all parts for a message
	 */
	async getParts(messageId: string): Promise<Part[]> {
		if (!isRedisAvailable()) {
			console.log(`[OC-STORE] getParts(${messageId}): Redis not available`);
			return [];
		}

		// Scan for all part keys in this message
		const pattern = `oc:message:${messageId}:part:*`;
		const keys = await scanKeys(pattern);
		console.log(
			`[OC-STORE] getParts(${messageId}): Found ${keys.length} part keys matching ${pattern}`,
		);

		const parts: Part[] = [];
		for (const key of keys) {
			const data = await redis.get(key);
			if (data) {
				const part = JSON.parse(data) as Part;
				parts.push(part);
			}
		}

		// Sort by ID
		parts.sort((a, b) => a.id.localeCompare(b.id));
		console.log(
			`[OC-STORE] getParts(${messageId}): Returning ${parts.length} parts`,
		);
		return parts;
	}

	// ========================================================================
	// Status Operations
	// ========================================================================

	async updateStatus(sessionId: string, status: SessionStatus): Promise<void> {
		const key = OpencodeKeys.status(sessionId);
		await redis.set(key, JSON.stringify(status));

		// Also update the tracked session if it exists
		const sessionKey = OpencodeKeys.session(sessionId);
		const sessionData = await redis.get(sessionKey);
		if (sessionData) {
			try {
				const state = JSON.parse(sessionData);
				if ("sessionType" in state) {
					state.status = status;
					state.updatedAt = Date.now();
					await redis.setex(sessionKey, 3600, JSON.stringify(state));
				}
			} catch {
				// Ignore parse errors
			}
		}

		console.log(
			`[OC-STORE] Updated status for session ${sessionId}: ${status.type}`,
		);
	}

	async getStatus(sessionId: string): Promise<SessionStatus | null> {
		const key = OpencodeKeys.status(sessionId);
		const data = await redis.get(key);
		if (!data) return null;
		return JSON.parse(data) as SessionStatus;
	}

	// ========================================================================
	// Diff Operations
	// ========================================================================

	async updateDiff(sessionId: string, diffs: FileDiff[]): Promise<void> {
		const key = OpencodeKeys.diff(sessionId);
		await redis.set(key, JSON.stringify(diffs));
		console.log(
			`[OC-STORE] Updated diff for session ${sessionId}: ${diffs.length} files`,
		);
	}

	async getDiff(sessionId: string): Promise<FileDiff[]> {
		const key = OpencodeKeys.diff(sessionId);
		const data = await redis.get(key);
		if (!data) return [];
		return JSON.parse(data) as FileDiff[];
	}

	// ========================================================================
	// Todo Operations
	// ========================================================================

	async updateTodos(sessionId: string, todos: Todo[]): Promise<void> {
		const key = OpencodeKeys.todos(sessionId);
		await redis.set(key, JSON.stringify(todos));
		console.log(
			`[OC-STORE] Updated todos for session ${sessionId}: ${todos.length} items`,
		);
	}

	async getTodos(sessionId: string): Promise<Todo[]> {
		const key = OpencodeKeys.todos(sessionId);
		const data = await redis.get(key);
		if (!data) return [];
		return JSON.parse(data) as Todo[];
	}

	// ========================================================================
	// Bulk Operations
	// ========================================================================

	/**
	 * Get full session data including messages and parts
	 */
	async getFullSession(sessionId: string): Promise<{
		session: Session | null;
		messages: Array<{ info: Message; parts: Part[] }>;
		status: SessionStatus | null;
		diff: FileDiff[];
		todos: Todo[];
	}> {
		const [session, status, diff, todos] = await Promise.all([
			this.getSession(sessionId),
			this.getStatus(sessionId),
			this.getDiff(sessionId),
			this.getTodos(sessionId),
		]);

		const messageInfos = await this.getMessages(sessionId);
		const messages = await Promise.all(
			messageInfos.map(async (info) => ({
				info,
				parts: await this.getParts(info.id),
			})),
		);

		return { session, messages, status, diff, todos };
	}

	/**
	 * Get all pending/active sessions (for UI restore)
	 */
	async getAllActiveSessions(): Promise<StoredSessionState[]> {
		if (!isRedisAvailable()) return [];

		// Scan for active session keys
		const pattern = "oc:ticket:*:active";
		const activeKeys = await scanKeys(pattern);

		const sessions: StoredSessionState[] = [];
		for (const key of activeKeys) {
			const sessionId = await redis.get(key);
			if (!sessionId) continue;

			const state = await this.getTrackedSession(sessionId);
			if (state) {
				sessions.push(state);
			}
		}

		return sessions;
	}
}

// Singleton instance
let storeInstance: OpencodeRedisStore | null = null;

export function getOpencodeStore(): OpencodeRedisStore {
	if (!storeInstance) {
		storeInstance = new OpencodeRedisStore();
	}
	return storeInstance;
}
