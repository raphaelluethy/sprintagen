/**
 * Database seeding script
 *
 * WARNING: This script is DESTRUCTIVE and will delete all existing data
 * from all tables before inserting seed data. Use only in local/development
 * environments.
 */

import { db } from "./index";
import {
	account,
	posts,
	session,
	type TicketPriority,
	type TicketProvider,
	type TicketStatus,
	ticketMessages,
	ticketRankings,
	ticketRecommendations,
	tickets,
	user,
	verification,
} from "./schema";

/**
 * Generate a Date object N days ago
 */
function daysAgo(days: number): Date {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date;
}

/**
 * Generate a future Date (for sessions/verification)
 */
function futureDate(daysFromNow: number): Date {
	const date = new Date();
	date.setDate(date.getDate() + daysFromNow);
	return date;
}

/**
 * Generate a Date object N seconds ago (for relative timestamps)
 */
function secondsAgo(seconds: number): Date {
	const date = new Date();
	date.setSeconds(date.getSeconds() - seconds);
	return date;
}

/**
 * Generate a Date object N days and M seconds ago
 */
function daysAndSecondsAgo(days: number, seconds: number): Date {
	const date = daysAgo(days);
	date.setSeconds(date.getSeconds() - seconds);
	return date;
}

async function main() {
	console.log("🌱 Starting database seed...");
	console.log(
		"⚠️  Note: Ensure migrations have been run (bun run db:push or db:migrate)",
	);
	console.log("");

	try {
		// ========================================================================
		// Step 1: Clear all tables in FK-safe order (children before parents)
		// ========================================================================
		console.log("🧹 Clearing existing data...");

		// Helper function to safely delete from a table (handles missing tables)
		const safeDelete = async (
			table: Parameters<typeof db.delete>[0],
			name: string,
		) => {
			try {
				await db.delete(table);
			} catch (error) {
				// Ignore "no such table" errors - tables might not exist yet
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				if (errorMessage.includes("no such table")) {
					console.log(`   ⚠️  Table ${name} doesn't exist yet, skipping delete`);
				} else {
					throw error;
				}
			}
		};

		await safeDelete(ticketMessages, "ticket_message");
		await safeDelete(ticketRecommendations, "ticket_recommendation");
		await safeDelete(ticketRankings, "ticket_ranking");
		await safeDelete(tickets, "ticket");
		await safeDelete(posts, "post");
		await safeDelete(session, "session");
		await safeDelete(account, "account");
		await safeDelete(verification, "verification");
		await safeDelete(user, "user");

		console.log("✅ All tables cleared (or don't exist yet)");

		// ========================================================================
		// Step 2: Insert users
		// ========================================================================
		console.log("👤 Inserting users...");

		const user1Id = crypto.randomUUID();
		const user2Id = crypto.randomUUID();

		const seedUsers = [
			{
				id: user1Id,
				name: "Alice Developer",
				email: "alice@example.com",
				emailVerified: true,
				image: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice",
				createdAt: daysAgo(30), // 30 days ago
			},
			{
				id: user2Id,
				name: "Bob Manager",
				email: "bob@example.com",
				emailVerified: true,
				image: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
				createdAt: daysAgo(15), // 15 days ago
			},
		];

		await db.insert(user).values(seedUsers);
		console.log(`✅ Inserted ${seedUsers.length} users`);

		// ========================================================================
		// Step 3: Insert accounts
		// ========================================================================
		console.log("🔐 Inserting accounts...");

		const seedAccounts = [
			{
				id: crypto.randomUUID(),
				userId: user1Id,
				accountId: "github_12345",
				providerId: "github",
				accessToken: "gho_mock_token_12345",
				refreshToken: null,
				accessTokenExpiresAt: futureDate(30),
				refreshTokenExpiresAt: null,
				scope: "read:user,user:email",
				idToken: null,
				password: null,
				createdAt: daysAgo(30),
			},
			{
				id: crypto.randomUUID(),
				userId: user2Id,
				accountId: "bob@example.com",
				providerId: "credential",
				accessToken: null,
				refreshToken: null,
				accessTokenExpiresAt: null,
				refreshTokenExpiresAt: null,
				scope: null,
				idToken: null,
				password: "$2a$10$mock_hashed_password", // Mock bcrypt hash
				createdAt: daysAgo(15),
			},
		];

		await db.insert(account).values(seedAccounts);
		console.log(`✅ Inserted ${seedAccounts.length} accounts`);

		// ========================================================================
		// Step 4: Insert sessions
		// ========================================================================
		console.log("🔑 Inserting sessions...");

		const seedSessions = [
			{
				id: crypto.randomUUID(),
				userId: user1Id,
				token: `session_token_alice_${crypto.randomUUID()}`,
				expiresAt: futureDate(7), // 7 days from now
				ipAddress: "192.168.1.100",
				userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
				createdAt: secondsAgo(60 * 60), // 1 hour ago
			},
			{
				id: crypto.randomUUID(),
				userId: user2Id,
				token: `session_token_bob_${crypto.randomUUID()}`,
				expiresAt: futureDate(14), // 14 days from now
				ipAddress: "192.168.1.101",
				userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
				createdAt: secondsAgo(60 * 120), // 2 hours ago
			},
		];

		await db.insert(session).values(seedSessions);
		console.log(`✅ Inserted ${seedSessions.length} sessions`);

		// ========================================================================
		// Step 5: Insert verification records
		// ========================================================================
		console.log("✉️  Inserting verification records...");

		const seedVerifications = [
			{
				id: crypto.randomUUID(),
				identifier: "alice@example.com",
				value: "verify_token_12345",
				expiresAt: futureDate(1), // 1 day from now
				createdAt: secondsAgo(60 * 30), // 30 minutes ago
			},
		];

		await db.insert(verification).values(seedVerifications);
		console.log(`✅ Inserted ${seedVerifications.length} verification records`);

		// ========================================================================
		// Step 6: Insert posts
		// ========================================================================
		console.log("📝 Inserting posts...");

		const seedPosts = [
			{
				name: "Initial setup",
				createdById: user1Id,
				createdAt: daysAgo(25),
			},
			{
				name: "Demo post",
				createdById: user1Id,
				createdAt: daysAgo(20),
			},
			{
				name: "Project kickoff",
				createdById: user2Id,
				createdAt: daysAgo(10),
			},
			{
				name: "Weekly update",
				createdById: user2Id,
				createdAt: daysAgo(3),
			},
		];

		await db.insert(posts).values(seedPosts);
		console.log(`✅ Inserted ${seedPosts.length} posts`);

		// ========================================================================
		// Step 7: Insert tickets with various combinations
		// ========================================================================
		console.log("🎫 Inserting tickets...");

		// ========================================================================
		// OpenCode GitHub Issues - Real showcase tickets from sst/opencode
		// https://github.com/sst/opencode/issues?q=sort%3Aupdated-desc+is%3Aissue+is%3Aopen
		// ========================================================================
		const seedTickets = [
			{
				id: crypto.randomUUID(),
				externalId: "4804",
				provider: "manual" as TicketProvider,
				title: "High CPU usage",
				description:
					"OpenCode exhibits high CPU usage during idle periods. The opentui TUI framework appears to be continuously polling or rendering even when no user input is occurring. This affects battery life on laptops and overall system performance.",
				status: "open" as TicketStatus,
				priority: "urgent" as TicketPriority,
				assignee: "alice@example.com",
				labels: ["bug", "perf", "opentui", "opencode"],
				metadata: {
					githubRepo: "sst/opencode",
					githubIssueNumber: 4804,
					githubIssueUrl: "https://github.com/sst/opencode/issues/4804",
				},
				aiScore: 9.2,
				createdAt: daysAgo(1),
				lastSyncedAt: secondsAgo(60 * 30),
			},
			{
				id: crypto.randomUUID(),
				externalId: "3013",
				provider: "manual" as TicketProvider,
				title: "Uses a huge amount of memory",
				description:
					"OpenCode memory usage grows significantly over time, especially during long coding sessions. Memory can reach several gigabytes after extended use, forcing users to restart the application. Likely related to message history accumulation or LSP caching.",
				status: "in_progress" as TicketStatus,
				priority: "high" as TicketPriority,
				assignee: "alice@example.com",
				labels: ["bad", "bug", "perf", "opencode"],
				metadata: {
					githubRepo: "sst/opencode",
					githubIssueNumber: 3013,
					githubIssueUrl: "https://github.com/sst/opencode/issues/3013",
				},
				aiScore: 8.7,
				createdAt: daysAgo(51),
				lastSyncedAt: daysAgo(1),
			},
			{
				id: crypto.randomUUID(),
				externalId: "4774",
				provider: "docker" as TicketProvider,
				title:
					"Docker container fails to start due to bun dependency install issue",
				description:
					"The OpenCode Docker container fails to start because bun dependency installation fails during container startup. The entrypoint script attempts to install dependencies but encounters permission or network issues in certain environments.",
				status: "open" as TicketStatus,
				priority: "high" as TicketPriority,
				assignee: null,
				labels: ["bug", "docker", "opencode"],
				metadata: {
					githubRepo: "sst/opencode",
					githubIssueNumber: 4774,
					githubIssueUrl: "https://github.com/sst/opencode/issues/4774",
					dockerImage: "opencode:latest",
				},
				aiScore: 7.8,
				createdAt: daysAgo(2),
				lastSyncedAt: secondsAgo(60 * 120),
			},
			{
				id: crypto.randomUUID(),
				externalId: "4808",
				provider: "manual" as TicketProvider,
				title: "Alt+d can no longer be remapped",
				description:
					"After the v1.0 opentui migration, the Alt+d keybinding can no longer be remapped in the opencode.json configuration. This affects users who want to customize their keyboard shortcuts, particularly those using terminal multiplexers like tmux.",
				status: "open" as TicketStatus,
				priority: "medium" as TicketPriority,
				assignee: null,
				labels: ["bug", "opentui", "opencode"],
				metadata: {
					githubRepo: "sst/opencode",
					githubIssueNumber: 4808,
					githubIssueUrl: "https://github.com/sst/opencode/issues/4808",
				},
				aiScore: 5.4,
				createdAt: daysAgo(1),
				lastSyncedAt: secondsAgo(60 * 60),
			},
			{
				id: crypto.randomUUID(),
				externalId: "4792",
				provider: "manual" as TicketProvider,
				title: "Anthropic provider in AI-SDK overwrites anthropic-beta headers",
				description:
					"When using the Anthropic provider through the AI-SDK, custom anthropic-beta headers are being overwritten. This prevents users from enabling beta features like extended thinking or prompt caching when using Claude models.",
				status: "review" as TicketStatus,
				priority: "medium" as TicketPriority,
				assignee: "bob@example.com",
				labels: ["bug", "opentui", "opencode", "providers"],
				metadata: {
					githubRepo: "sst/opencode",
					githubIssueNumber: 4792,
					githubIssueUrl: "https://github.com/sst/opencode/issues/4792",
				},
				aiScore: 6.5,
				createdAt: daysAgo(2),
				lastSyncedAt: secondsAgo(60 * 90),
			},
			{
				id: crypto.randomUUID(),
				externalId: "3734",
				provider: "manual" as TicketProvider,
				title: "CJK characters break some features like @ mentions",
				description:
					"When typing CJK (Chinese, Japanese, Korean) characters, the @ mention feature breaks. The input method editor (IME) composition interferes with the mention detection logic, causing incorrect behavior or crashes for international users.",
				status: "open" as TicketStatus,
				priority: "medium" as TicketPriority,
				assignee: null,
				labels: ["bug", "opentui", "opencode", "i18n"],
				metadata: {
					githubRepo: "sst/opencode",
					githubIssueNumber: 3734,
					githubIssueUrl: "https://github.com/sst/opencode/issues/3734",
				},
				aiScore: 6.1,
				createdAt: daysAgo(26),
				lastSyncedAt: daysAgo(1),
			},
			{
				id: crypto.randomUUID(),
				externalId: "4801",
				provider: "manual" as TicketProvider,
				title:
					"[FEATURE]: Print some info when exiting: title, command to resume, usage stats",
				description:
					"Feature request to display useful information when exiting OpenCode, such as: the session title, a command to resume the session, and usage statistics (tokens used, cost, duration). This would improve the developer experience for users who frequently switch between sessions.",
				status: "open" as TicketStatus,
				priority: "low" as TicketPriority,
				assignee: null,
				labels: ["discussion", "feature", "opencode", "ux"],
				metadata: {
					githubRepo: "sst/opencode",
					githubIssueNumber: 4801,
					githubIssueUrl: "https://github.com/sst/opencode/issues/4801",
				},
				aiScore: 4.2,
				createdAt: daysAgo(2),
				lastSyncedAt: null,
			},
			{
				id: crypto.randomUUID(),
				externalId: "2464",
				provider: "manual" as TicketProvider,
				title:
					"AT_APICallError: prompt token count of 130389 exceeds the limit of 128000",
				description:
					"Users encounter AT_APICallError when the accumulated context exceeds model token limits. This commonly happens in long sessions or when working with large codebases. The error message is not user-friendly and there's no automatic context compaction.",
				status: "in_progress" as TicketStatus,
				priority: "high" as TicketPriority,
				assignee: "alice@example.com",
				labels: ["bug", "opencode", "context", "tokens"],
				metadata: {
					githubRepo: "sst/opencode",
					githubIssueNumber: 2464,
					githubIssueUrl: "https://github.com/sst/opencode/issues/2464",
				},
				aiScore: 8.1,
				createdAt: daysAgo(83),
				lastSyncedAt: daysAgo(1),
			},
			{
				id: crypto.randomUUID(),
				externalId: "4754",
				provider: "manual" as TicketProvider,
				title: "Copy and Paste behaviour under Linux",
				description:
					"Copy and paste functionality does not work correctly under Linux. The clipboard integration with X11/Wayland is inconsistent, and users report that copied text from OpenCode doesn't appear in their system clipboard or vice versa.",
				status: "open" as TicketStatus,
				priority: "medium" as TicketPriority,
				assignee: "bob@example.com",
				labels: ["bug", "opentui", "opencode", "linux"],
				metadata: {
					githubRepo: "sst/opencode",
					githubIssueNumber: 4754,
					githubIssueUrl: "https://github.com/sst/opencode/issues/4754",
				},
				aiScore: 5.9,
				createdAt: daysAgo(3),
				lastSyncedAt: secondsAgo(60 * 180),
			},
			{
				id: crypto.randomUUID(),
				externalId: "1975",
				provider: "manual" as TicketProvider,
				title: "ctrl + arrow key no longer moves word-to-word",
				description:
					"The standard Ctrl+Arrow keyboard navigation for moving the cursor word-by-word no longer works after recent updates. This is a common text editing shortcut that users expect to work in any text input field.",
				status: "done" as TicketStatus,
				priority: "medium" as TicketPriority,
				assignee: "alice@example.com",
				labels: ["bug", "opencode", "keyboard"],
				metadata: {
					githubRepo: "sst/opencode",
					githubIssueNumber: 1975,
					githubIssueUrl: "https://github.com/sst/opencode/issues/1975",
				},
				aiScore: 5.2,
				createdAt: daysAgo(104),
				lastSyncedAt: daysAgo(1),
			},
		];

		await db.insert(tickets).values(seedTickets);
		console.log(`✅ Inserted ${seedTickets.length} tickets`);

		// ========================================================================
		// Step 8: Insert ticket messages (conversations)
		// ========================================================================
		console.log("💬 Inserting ticket messages...");

		const ticketCpu = seedTickets[0]; // High CPU usage (#4804)
		const ticketDocker = seedTickets[2]; // Docker container fails (#4774)
		const ticketTokens = seedTickets[7]; // Token count exceeds limit (#2464)

		if (!ticketCpu || !ticketDocker || !ticketTokens) {
			throw new Error("Required tickets not found for message seeding");
		}

		const seedMessages = [
			// Conversation for High CPU usage ticket (#4804)
			{
				id: crypto.randomUUID(),
				ticketId: ticketCpu.id,
				role: "user" as const,
				content:
					"I'm seeing OpenCode using 100% CPU even when idle. Can you help me understand what's causing this?",
				modelUsed: null,
				createdAt: daysAndSecondsAgo(1, -60 * 60),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketCpu.id,
				role: "assistant" as const,
				content:
					"I've analyzed the opentui rendering loop. The high CPU usage appears to be caused by the TUI framework's render cycle not properly yielding when there's no user input. Looking at packages/tui/src/render.ts, the animation frame loop runs continuously. I recommend adding an idle detection mechanism that reduces the render frequency when no input events are detected.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(1, -60 * 62),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketCpu.id,
				role: "user" as const,
				content:
					"That makes sense. Is there a quick workaround users can apply while waiting for a fix?",
				modelUsed: null,
				createdAt: daysAndSecondsAgo(1, -60 * 63),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketCpu.id,
				role: "assistant" as const,
				content:
					"Unfortunately there's no user-facing workaround since this is in the core rendering logic. However, users on laptops can mitigate battery impact by running OpenCode in a terminal with reduced refresh rate, or using a power profile that limits CPU frequency. The fix will need to come from the opentui package.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(1, -60 * 65),
			},
			// Conversation for Docker container fails ticket (#4774)
			{
				id: crypto.randomUUID(),
				ticketId: ticketDocker.id,
				role: "user" as const,
				content:
					"The OpenCode Docker container keeps failing on startup. The logs show bun install errors. What's going wrong?",
				modelUsed: null,
				createdAt: daysAndSecondsAgo(2, -60 * 30),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketDocker.id,
				role: "assistant" as const,
				content:
					"Looking at the Dockerfile and entrypoint-opencode.sh, the issue is that bun install runs at container startup rather than build time. This causes problems in environments with restricted network access or when running as non-root. The fix should move dependency installation to the Dockerfile build stage and only run the application in the entrypoint.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(2, -60 * 32),
			},
			// Conversation for token count exceeds limit (#2464)
			{
				id: crypto.randomUUID(),
				ticketId: ticketTokens.id,
				role: "user" as const,
				content:
					"I keep getting AT_APICallError about token limits. How does OpenCode handle context compaction?",
				modelUsed: null,
				createdAt: daysAndSecondsAgo(83, -60 * 120),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketTokens.id,
				role: "assistant" as const,
				content:
					"OpenCode has a /compact command that summarizes the conversation history to reduce token count. However, the error occurs because there's no automatic compaction before hitting the limit. The session API at POST /project/:projectID/session/:sessionID/compact can be called manually. A better UX would be to automatically trigger compaction when approaching 80% of the model's context limit.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(83, -60 * 122),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketTokens.id,
				role: "user" as const,
				content: "Can we add a warning before hitting the limit?",
				modelUsed: null,
				createdAt: daysAndSecondsAgo(83, -60 * 123),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketTokens.id,
				role: "assistant" as const,
				content:
					"Yes, that would be a good improvement. The token count is tracked in the message handler. We could add a warning when usage exceeds 90% and suggest running /compact. This should be implemented in packages/opencode/src/session/message.ts where the API call is made.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(83, -60 * 125),
			},
		];

		await db.insert(ticketMessages).values(seedMessages);
		console.log(`✅ Inserted ${seedMessages.length} ticket messages`);

		// ========================================================================
		// Step 9: Insert ticket recommendations
		// ========================================================================
		console.log("💡 Inserting ticket recommendations...");

		const ticketMemory = seedTickets[1]; // Memory issues (#3013)
		const ticketAnthropicHeaders = seedTickets[4]; // Anthropic provider headers (#4792)
		if (!ticketMemory || !ticketAnthropicHeaders) {
			throw new Error("Required ticket not found for recommendation seeding");
		}

		const seedRecommendations = [
			{
				id: crypto.randomUUID(),
				ticketId: ticketCpu.id,
				recommendedSteps:
					"1. Profile the opentui render loop in packages/tui/src/render.ts\n2. Add idle detection to reduce render frequency when no input events occur\n3. Implement requestIdleCallback or similar throttling mechanism\n4. Add performance metrics logging for debugging\n5. Test CPU usage on different platforms (macOS, Linux, Windows)",
				recommendedProgrammer: "alice@example.com",
				reasoning:
					"This requires deep understanding of the opentui rendering architecture. Alice has experience with performance optimization and TUI frameworks.",
				opencodeSummary:
					"The CPU issue stems from the render loop in opentui not yielding during idle periods. Key files: packages/tui/src/render.ts, packages/tui/src/input.ts",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(1, -60 * 67),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketDocker.id,
				recommendedSteps:
					"1. Move bun install from entrypoint-opencode.sh to Dockerfile\n2. Use multi-stage build to keep final image small\n3. Add proper error handling for network-restricted environments\n4. Test with rootless Docker and Podman\n5. Update documentation with troubleshooting steps",
				recommendedProgrammer: null,
				reasoning:
					"This is a Docker configuration issue that any developer familiar with containerization can handle. The fix is straightforward once the root cause is understood.",
				opencodeSummary:
					"Docker startup fails because dependencies are installed at runtime instead of build time. Key files: Dockerfile, entrypoint-opencode.sh",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(2, -60 * 33),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketTokens.id,
				recommendedSteps:
					"1. Track token usage in packages/opencode/src/session/message.ts\n2. Add warning at 80% and 90% of model context limit\n3. Implement automatic /compact suggestion in the TUI\n4. Consider auto-compaction option in opencode.json config\n5. Improve error message to explain the issue and suggest solutions",
				recommendedProgrammer: "alice@example.com",
				reasoning:
					"This requires understanding of the session message handling and token counting. Alice has worked on the context management features.",
				opencodeSummary:
					"Token limit errors occur because there's no proactive warning or automatic compaction. Key files: packages/opencode/src/session/message.ts, packages/opencode/src/command/compact.ts",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(83, -60 * 60),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketAnthropicHeaders.id,
				recommendedSteps:
					"1. Review AI-SDK Anthropic provider configuration\n2. Check header merging logic in the provider wrapper\n3. Ensure custom anthropic-beta headers are preserved\n4. Add tests for header passthrough\n5. Document supported beta features in opencode.ai docs",
				recommendedProgrammer: "bob@example.com",
				reasoning:
					"Bob has experience with the AI provider integrations and understands the AI-SDK internals. This requires careful header handling.",
				opencodeSummary:
					"The Anthropic provider in AI-SDK overwrites user-provided headers instead of merging them. Key files: packages/opencode/src/provider/anthropic.ts",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(2, -60 * 90),
			},
		];

		await db.insert(ticketRecommendations).values(seedRecommendations);
		console.log(
			`✅ Inserted ${seedRecommendations.length} ticket recommendations`,
		);

		// ========================================================================
		// Step 10: Insert ticket rankings
		// ========================================================================
		console.log("📊 Inserting ticket rankings...");

		const ticketFeature = seedTickets[6]; // Feature request (#4801)
		const ticketCjk = seedTickets[5]; // CJK characters (#3734)
		if (!ticketFeature || !ticketCjk) {
			throw new Error("Required ticket not found for ranking seeding");
		}

		const seedRankings = [
			{
				id: crypto.randomUUID(),
				ticketId: ticketCpu.id,
				urgencyScore: 9.5,
				impactScore: 9.0,
				complexityScore: 7.0,
				overallScore: 9.2,
				reasoning:
					"Critical performance issue affecting all OpenCode users. High CPU usage drains laptop batteries and degrades system performance. Requires understanding of opentui internals.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(1, -60 * 83),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketMemory.id,
				urgencyScore: 8.0,
				impactScore: 8.5,
				complexityScore: 8.0,
				overallScore: 8.7,
				reasoning:
					"Memory leaks cause OpenCode to become unusable in long sessions. High impact on power users who keep sessions open for hours. Complex to diagnose and fix.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(51, -60 * 50),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketTokens.id,
				urgencyScore: 7.5,
				impactScore: 8.0,
				complexityScore: 5.0,
				overallScore: 8.1,
				reasoning:
					"Token limit errors frustrate users working on large codebases. Medium complexity as the fix involves adding warnings and improving UX, not fundamental architecture changes.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(83, -60 * 67),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketDocker.id,
				urgencyScore: 7.0,
				impactScore: 7.5,
				complexityScore: 4.0,
				overallScore: 7.8,
				reasoning:
					"Blocks users trying to run OpenCode in containerized environments. Relatively simple fix once root cause is identified. Impacts enterprise and CI/CD users.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(2, -60 * 30),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketFeature.id,
				urgencyScore: 3.0,
				impactScore: 5.0,
				complexityScore: 3.0,
				overallScore: 4.2,
				reasoning:
					"Nice-to-have feature for improved UX on exit. Low urgency and complexity. Moderate impact for users managing multiple sessions.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(2, -60 * 45),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticketCjk.id,
				urgencyScore: 6.0,
				impactScore: 7.0,
				complexityScore: 6.0,
				overallScore: 6.1,
				reasoning:
					"Important for international users in East Asia. Requires understanding of IME composition and text input handling. Medium complexity due to cross-platform considerations.",
				modelUsed: "minimax-m2.1-free",
				createdAt: daysAndSecondsAgo(26, -60 * 133),
			},
		];

		await db.insert(ticketRankings).values(seedRankings);
		console.log(`✅ Inserted ${seedRankings.length} ticket rankings`);

		console.log("\n✨ Database seeding completed successfully!");
		console.log("\nSummary:");
		console.log(`  - ${seedUsers.length} users`);
		console.log(`  - ${seedAccounts.length} accounts`);
		console.log(`  - ${seedSessions.length} sessions`);
		console.log(`  - ${seedVerifications.length} verification records`);
		console.log(`  - ${seedPosts.length} posts`);
		console.log(`  - ${seedTickets.length} tickets`);
		console.log(`  - ${seedMessages.length} ticket messages`);
		console.log(`  - ${seedRecommendations.length} ticket recommendations`);
		console.log(`  - ${seedRankings.length} ticket rankings`);
	} catch (error) {
		console.error("❌ Error seeding database:", error);
		process.exit(1);
	}
}

// Run the seed script
main()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error("❌ Fatal error:", error);
		process.exit(1);
	});
