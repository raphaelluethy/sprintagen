import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
	opencodeSessionsTable,
	ticketRecommendations,
} from "@/server/db/schema";
import {
	isRedisAvailable,
	RedisKeys,
	redis,
	scanKeys,
	waitForRedisConnection,
} from "@/server/redis";
import type { OpencodeChatMessage, ToolPart } from "./opencode";

/**
 * Redis Session State Schema
 */
export interface RedisSessionState {
	sessionId: string;
	ticketId?: string;
	sessionType: "chat" | "ask" | "admin";
	status: "pending" | "running" | "completed" | "error";
	messages: OpencodeChatMessage[];
	currentToolCalls: ToolPart[];
	error?: string;
	startedAt: number;
	updatedAt: number;
}

/**
 * Create a pending session entry in Redis
 * Silently skips if Redis is not available
 */
export async function createPendingSession(
	sessionId: string,
	options: {
		ticketId?: string;
		sessionType: "chat" | "ask" | "admin";
		metadata?: Record<string, unknown>;
	},
): Promise<void> {
	console.log(
		`[SESSION-STATE] createPendingSession called for session ${sessionId}, ticketId: ${options.ticketId}`,
	);

	// Wait for Redis connection to be established
	const redisConnected = await waitForRedisConnection();
	console.log(
		`[SESSION-STATE] Redis connection status after wait: ${redisConnected}`,
	);

	if (!redisConnected) {
		console.log(
			`[SESSION-STATE] Redis not available, skipping session ${sessionId} creation`,
		);
		return;
	}

	const now = Date.now();
	const state: RedisSessionState = {
		sessionId,
		ticketId: options.ticketId,
		sessionType: options.sessionType,
		status: "pending",
		messages: [],
		currentToolCalls: [],
		startedAt: now,
		updatedAt: now,
	};

	const key = RedisKeys.session(sessionId);
	const sessionSetResult = await redis.setex(key, 3600, JSON.stringify(state)); // 1 hour TTL
	console.log(
		`[SESSION-STATE] Redis setex for session key ${key}: ${sessionSetResult ? "success" : "failed"}`,
	);

	// Set active session lookup only for Ask Opencode runs
	// This prevents regular chat sessions from being treated as "pending Ask"
	// when restoring state or checking for active analyses.
	if (options.ticketId && options.sessionType === "ask") {
		const activeKey = RedisKeys.activeSession(options.ticketId);
		const activeSetResult = await redis.setex(activeKey, 3600, sessionId);
		console.log(
			`[SESSION-STATE] Redis setex for active key ${activeKey}: ${activeSetResult ? "success" : "failed"}`,
		);
	}

	console.log(
		`[SESSION-STATE] Created pending session ${sessionId} for ticket ${options.ticketId}`,
	);
}

/**
 * Update session state in Redis with new messages/tool calls
 * Silently skips if Redis is not available
 */
export async function updateSessionState(
	sessionId: string,
	updates: {
		messages?: OpencodeChatMessage[];
		currentToolCalls?: ToolPart[];
		status?: "pending" | "running" | "completed" | "error";
		error?: string;
	},
): Promise<void> {
	if (!isRedisAvailable()) {
		return;
	}

	const key = RedisKeys.session(sessionId);
	const existing = await redis.get(key);

	if (!existing) {
		console.warn(`[SESSION-STATE] Session ${sessionId} not found in Redis`);
		return;
	}

	const state: RedisSessionState = JSON.parse(existing);

	// Merge updates
	if (updates.messages) {
		state.messages = [...state.messages, ...updates.messages];
	}
	if (updates.currentToolCalls !== undefined) {
		state.currentToolCalls = updates.currentToolCalls;
	}
	if (updates.status) {
		state.status = updates.status;
	}
	if (updates.error !== undefined) {
		state.error = updates.error;
	}

	state.updatedAt = Date.now();

	// Update Redis with extended TTL
	await redis.setex(key, 3600, JSON.stringify(state));

	// Publish update to pub/sub channel
	const channel = RedisKeys.updates(sessionId);
	await redis.publish(channel, JSON.stringify({ type: "update", state }));

	console.log(
		`[SESSION-STATE] Updated session ${sessionId} (status: ${state.status})`,
	);
}

/**
 * Complete session: archive to PostgreSQL and clean Redis
 */
export async function completeSession(
	sessionId: string,
	options?: {
		error?: string;
	},
): Promise<void> {
	const key = RedisKeys.session(sessionId);
	const existing = await redis.get(key);

	// If Redis is not available or session not found, just log and return
	if (!existing) {
		console.warn(
			`[SESSION-STATE] Session ${sessionId} not found in Redis for completion`,
		);
		return;
	}

	const state: RedisSessionState = JSON.parse(existing);

	// Archive to PostgreSQL
	try {
		await db.insert(opencodeSessionsTable).values({
			id: sessionId,
			ticketId: state.ticketId ?? null,
			sessionType: state.sessionType,
			status: options?.error ? "error" : "completed",
			messages: state.messages as unknown[],
			metadata: state.ticketId ? { ticketId: state.ticketId } : undefined,
			startedAt: new Date(state.startedAt),
			completedAt: new Date(),
			errorMessage: options?.error ?? state.error ?? null,
		});
		console.log(`[SESSION-STATE] Archived session ${sessionId} to PostgreSQL`);
	} catch (error) {
		console.error(
			`[SESSION-STATE] Failed to archive session ${sessionId}:`,
			error,
		);
	}

	const assistantMessages = state.messages
		.filter((message) => message.role === "assistant" && message.text?.trim())
		.map((message) => message.text)
		.filter(Boolean);

	if (
		state.ticketId &&
		state.sessionType === "ask" &&
		assistantMessages.length > 0
	) {
		const finalText = assistantMessages.join("\n\n");
		try {
			await db.insert(ticketRecommendations).values({
				ticketId: state.ticketId,
				opencodeSummary: finalText,
				modelUsed: "opencode",
			});
		} catch (error) {
			console.error(
				`[SESSION-STATE] Failed to save Opencode summary for ticket ${state.ticketId}:`,
				error,
			);
		}
	}

	// Clean up Redis
	await redis.del(key);

	// Clean up active session lookup if ticketId exists
	if (state.ticketId) {
		const activeKey = RedisKeys.activeSession(state.ticketId);
		const activeSessionId = await redis.get(activeKey);
		if (activeSessionId === sessionId) {
			await redis.del(activeKey);
		}
	}

	// Publish completion event
	const channel = RedisKeys.updates(sessionId);
	await redis.publish(
		channel,
		JSON.stringify({
			type: "complete",
			state: { ...state, status: options?.error ? "error" : "completed" },
		}),
	);

	console.log(`[SESSION-STATE] Completed session ${sessionId}`);
}

/**
 * Get active session ID for a ticket from Redis
 * Returns null if Redis is not available
 */
export async function getActiveSession(
	ticketId: string,
): Promise<string | null> {
	if (!isRedisAvailable()) {
		return null;
	}

	const activeKey = RedisKeys.activeSession(ticketId);
	const sessionId = await redis.get(activeKey);
	return sessionId;
}

/**
 * Get current session state from Redis
 * Returns null if Redis is not available or session not found
 */
export async function getSessionState(
	sessionId: string,
): Promise<RedisSessionState | null> {
	if (!isRedisAvailable()) {
		return null;
	}

	const key = RedisKeys.session(sessionId);
	const data = await redis.get(key);
	if (!data) {
		return null;
	}
	return JSON.parse(data) as RedisSessionState;
}

/**
 * Get session history from PostgreSQL
 */
export async function getSessionHistory(ticketId: string) {
	return db.query.opencodeSessionsTable.findMany({
		where: eq(opencodeSessionsTable.ticketId, ticketId),
		orderBy: (sessions, { desc }) => desc(sessions.startedAt),
	});
}

const STALE_SESSION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get all pending/running sessions for a list of ticket IDs
 * Returns a map of ticketId -> session state for tickets with active sessions
 */
export async function getPendingSessionsForTickets(
	ticketIds: string[],
): Promise<Map<string, RedisSessionState>> {
	const result = new Map<string, RedisSessionState>();

	if (!isRedisAvailable() || ticketIds.length === 0) {
		return result;
	}

	// Check each ticket for an active session
	for (const ticketId of ticketIds) {
		const sessionId = await getActiveSession(ticketId);
		if (!sessionId) continue;

		const state = await getSessionState(sessionId);
		if (!state) {
			// Session missing in Redis; clean the active key
			const activeKey = RedisKeys.activeSession(ticketId);
			await redis.del(activeKey);
			continue;
		}

		// Only include sessions that are still pending or running (and fresh)
		const isPendingOrRunning =
			state.status === "pending" || state.status === "running";
		const isStale = Date.now() - state.updatedAt > STALE_SESSION_WINDOW_MS;

		if (isPendingOrRunning && !isStale) {
			result.set(ticketId, state);
		} else {
			// Clean up stale or completed/error active references
			const activeKey = RedisKeys.activeSession(ticketId);
			await redis.del(activeKey);
		}
	}

	return result;
}

/**
 * Get all active sessions - checks Redis first, then falls back to DB
 * Returns a list of session states that are pending or running
 */
export async function getAllPendingSessions(): Promise<RedisSessionState[]> {
	const sessions: RedisSessionState[] = [];

	// Wait for Redis connection to be established
	const redisConnected = await waitForRedisConnection();
	console.log(
		`[SESSION-STATE] getAllPendingSessions called, Redis connected: ${redisConnected}`,
	);

	// First, try to get sessions from Redis using SCAN
	if (redisConnected) {
		try {
			// Scan for all active ticket session keys: opencode:ticket:*:active
			const activeKeys = await scanKeys("opencode:ticket:*:active");

			console.log(
				`[SESSION-STATE] Found ${activeKeys.length} active session keys in Redis: ${JSON.stringify(activeKeys)}`,
			);

			for (const key of activeKeys) {
				// Get the session ID from the active key
				const sessionId = await redis.get(key);
				console.log(
					`[SESSION-STATE] Key ${key} maps to sessionId: ${sessionId}`,
				);
				if (!sessionId) {
					await redis.del(key);
					continue;
				}

				// Get the full session state
				const state = await getSessionState(sessionId);
				console.log(
					`[SESSION-STATE] Session ${sessionId} state: ${state ? state.status : "not found"}`,
				);
				if (!state) {
					await redis.del(key);
					continue;
				}

				// Only include sessions that are still pending or running (and fresh)
				const isPendingOrRunning =
					state.status === "pending" || state.status === "running";
				const isStale = Date.now() - state.updatedAt > STALE_SESSION_WINDOW_MS;

				if (isPendingOrRunning && !isStale) {
					sessions.push(state);
				} else {
					// Clean up stale active references for completed/error sessions
					await redis.del(key);
				}
			}

			// If we found sessions in Redis, return them
			if (sessions.length > 0) {
				console.log(
					`[SESSION-STATE] Returning ${sessions.length} pending sessions from Redis`,
				);
				return sessions;
			}
		} catch (error) {
			console.error(
				"[SESSION-STATE] Error scanning Redis for pending sessions:",
				error,
			);
		}
	}

	// Fall back to database for pending/running sessions
	// This handles cases where Redis is not available or sessions weren't found in Redis
	try {
		console.log("[SESSION-STATE] Checking database for pending sessions");

		const dbSessions = await db.query.opencodeSessionsTable.findMany({
			where: inArray(opencodeSessionsTable.status, ["pending", "running"]),
		});

		console.log(
			`[SESSION-STATE] Found ${dbSessions.length} pending sessions in database`,
		);

		// Convert DB sessions to RedisSessionState format
		for (const dbSession of dbSessions) {
			const state: RedisSessionState = {
				sessionId: dbSession.id,
				ticketId: dbSession.ticketId ?? undefined,
				sessionType: dbSession.sessionType,
				status: dbSession.status,
				messages: (dbSession.messages as OpencodeChatMessage[]) ?? [],
				currentToolCalls: [],
				startedAt: dbSession.startedAt.getTime(),
				updatedAt: dbSession.startedAt.getTime(),
				error: dbSession.errorMessage ?? undefined,
			};
			sessions.push(state);
		}
	} catch (error) {
		console.error(
			"[SESSION-STATE] Error querying database for pending sessions:",
			error,
		);
	}

	return sessions;
}
