import Redis from "ioredis";
import { env } from "@/env";

// Redis connection state
let redisClient: Redis | null = null;
let redisSubClient: Redis | null = null;
let connectionAttempted = false;
let isConnected = false;

// Promise that resolves when Redis connection is established or failed
let connectionPromise: Promise<boolean> | null = null;

/**
 * Lazily get or create the main Redis client
 * Returns null if Redis is not available
 */
function getRedisClient(): Redis | null {
	if (redisClient) {
		return isConnected ? redisClient : null;
	}

	if (connectionAttempted) {
		return null;
	}

	connectionAttempted = true;
	console.log("[REDIS] Initializing Redis client...");

	try {
		redisClient = new Redis(env.REDIS_URL, {
			maxRetriesPerRequest: 3,
			retryStrategy(times) {
				if (times > 3) {
					console.warn("[REDIS] Max retries reached, giving up");
					return null; // Stop retrying
				}
				return Math.min(times * 100, 1000);
			},
			lazyConnect: true,
		});

		redisClient.on("error", (err) => {
			if (err.code === "ECONNREFUSED") {
				console.warn("[REDIS] Connection refused - Redis may not be running");
				isConnected = false;
			} else {
				console.error("[REDIS] Connection error:", err.message);
			}
		});

		redisClient.on("connect", () => {
			console.log("[REDIS] Connected to Redis");
			isConnected = true;
		});

		redisClient.on("ready", () => {
			console.log("[REDIS] Redis client ready");
			isConnected = true;
		});

		redisClient.on("close", () => {
			console.log("[REDIS] Connection closed");
			isConnected = false;
		});

		// Try to connect and wait for it
		connectionPromise = redisClient
			.connect()
			.then(() => {
				console.log("[REDIS] Connection established");
				isConnected = true;
				return true;
			})
			.catch((err) => {
				console.warn(
					"[REDIS] Failed to connect - Redis features disabled:",
					err?.message,
				);
				isConnected = false;
				return false;
			});

		return redisClient;
	} catch (error) {
		console.warn("[REDIS] Failed to initialize Redis client:", error);
		return null;
	}
}

/**
 * Wait for Redis connection to be established
 * Returns true if connected, false otherwise
 */
export async function waitForRedisConnection(): Promise<boolean> {
	getRedisClient(); // Ensure connection is attempted
	if (connectionPromise) {
		await connectionPromise;
	}
	return isConnected;
}

/**
 * Lazily get or create the subscriber Redis client
 * Returns null if Redis is not available
 */
function getRedisSubClient(): Redis | null {
	if (redisSubClient) {
		return isConnected ? redisSubClient : null;
	}

	// Only create sub client if main client connected successfully
	if (!isConnected) {
		return null;
	}

	try {
		redisSubClient = new Redis(env.REDIS_URL, {
			maxRetriesPerRequest: 3,
			retryStrategy(times) {
				if (times > 3) {
					return null;
				}
				return Math.min(times * 100, 1000);
			},
		});

		redisSubClient.on("error", (err) => {
			if (err.code !== "ECONNREFUSED") {
				console.error("[REDIS] Subscriber connection error:", err.message);
			}
		});

		redisSubClient.on("connect", () => {
			console.log("[REDIS] Subscriber connected to Redis");
		});

		return redisSubClient;
	} catch (error) {
		console.warn("[REDIS] Failed to initialize subscriber client:", error);
		return null;
	}
}

// Typed helpers for Redis keys
export const RedisKeys = {
	session: (id: string) => `opencode:session:${id}`,
	activeSession: (ticketId: string) => `opencode:ticket:${ticketId}:active`,
	updates: (sessionId: string) => `opencode:updates:${sessionId}`,
} as const;

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
	getRedisClient(); // Ensure connection attempted
	console.log(
		`[REDIS] isRedisAvailable called, connectionAttempted: ${connectionAttempted}, isConnected: ${isConnected}`,
	);
	return isConnected;
}

/**
 * Safe Redis wrapper that returns null operations when Redis is unavailable
 */
export const redis = {
	async get(key: string): Promise<string | null> {
		const client = getRedisClient();
		if (!client || !isConnected) return null;
		try {
			return await client.get(key);
		} catch {
			return null;
		}
	},

	async set(key: string, value: string): Promise<boolean> {
		const client = getRedisClient();
		if (!client || !isConnected) return false;
		try {
			await client.set(key, value);
			return true;
		} catch {
			return false;
		}
	},

	async setex(key: string, seconds: number, value: string): Promise<boolean> {
		const client = getRedisClient();
		if (!client || !isConnected) return false;
		try {
			await client.setex(key, seconds, value);
			return true;
		} catch {
			return false;
		}
	},

	async del(key: string): Promise<boolean> {
		const client = getRedisClient();
		if (!client || !isConnected) return false;
		try {
			await client.del(key);
			return true;
		} catch {
			return false;
		}
	},

	async publish(channel: string, message: string): Promise<boolean> {
		const client = getRedisClient();
		if (!client || !isConnected) return false;
		try {
			await client.publish(channel, message);
			return true;
		} catch {
			return false;
		}
	},
};

/**
 * Get a raw Redis client for pub/sub subscriptions
 * Returns null if Redis is not available
 */
export function getSubscriberClient(): Redis | null {
	return getRedisSubClient();
}

/**
 * Create a new Redis connection for SSE subscriptions
 * Returns null if Redis is not available
 */
export function createSubscriber(): Redis | null {
	if (!isRedisAvailable()) {
		return null;
	}

	try {
		const subscriber = new Redis(env.REDIS_URL, {
			maxRetriesPerRequest: 3,
			retryStrategy(times) {
				if (times > 3) {
					return null;
				}
				return Math.min(times * 100, 1000);
			},
		});

		return subscriber;
	} catch {
		return null;
	}
}

/**
 * Scan Redis keys matching a pattern
 * Returns empty array if Redis is not available
 */
export async function scanKeys(pattern: string): Promise<string[]> {
	const client = getRedisClient();
	console.log(
		`[REDIS] scanKeys called with pattern: ${pattern}, client: ${!!client}, isConnected: ${isConnected}`,
	);
	if (!client || !isConnected) {
		console.log(
			"[REDIS] scanKeys returning empty - no client or not connected",
		);
		return [];
	}

	try {
		const keys: string[] = [];
		let cursor = "0";

		do {
			const [newCursor, foundKeys] = await client.scan(
				cursor,
				"MATCH",
				pattern,
				"COUNT",
				100,
			);
			cursor = newCursor;
			keys.push(...foundKeys);
			console.log(
				`[REDIS] scanKeys iteration - cursor: ${cursor}, found: ${foundKeys.length} keys`,
			);
		} while (cursor !== "0");

		console.log(
			`[REDIS] scanKeys completed - total keys found: ${keys.length}`,
		);
		return keys;
	} catch (error) {
		console.error("[REDIS] scanKeys error:", error);
		return [];
	}
}
