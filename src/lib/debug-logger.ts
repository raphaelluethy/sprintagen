/**
 * Creates a styled debug logger for development environments.
 * Logs are only shown when NODE_ENV is "development".
 *
 * @param prefix - The prefix to show in log messages (e.g., "Chat", "API")
 * @returns A logger object with info, success, warn, error, and debug methods
 */
export function createDebugLogger(prefix: string) {
	const DEBUG = process.env.NODE_ENV === "development";

	return {
		info: (label: string, ...args: unknown[]) => {
			if (DEBUG)
				console.log(
					`%c[${prefix}] %c${label}`,
					"color: #10b981; font-weight: bold",
					"color: #a1a1aa",
					...args,
				);
		},
		success: (label: string, ...args: unknown[]) => {
			if (DEBUG)
				console.log(
					`%c[${prefix}] %c✓ ${label}`,
					"color: #10b981; font-weight: bold",
					"color: #22c55e",
					...args,
				);
		},
		warn: (label: string, ...args: unknown[]) => {
			if (DEBUG)
				console.warn(
					`%c[${prefix}] %c⚠ ${label}`,
					"color: #10b981; font-weight: bold",
					"color: #eab308",
					...args,
				);
		},
		error: (label: string, ...args: unknown[]) => {
			if (DEBUG)
				console.error(
					`%c[${prefix}] %c✗ ${label}`,
					"color: #10b981; font-weight: bold",
					"color: #ef4444",
					...args,
				);
		},
		debug: (label: string, data: unknown) => {
			if (DEBUG) {
				console.groupCollapsed(
					`%c[${prefix}] %c${label}`,
					"color: #10b981; font-weight: bold",
					"color: #6366f1",
				);
				console.log(data);
				console.groupEnd();
			}
		},
	};
}

export type DebugLogger = ReturnType<typeof createDebugLogger>;
