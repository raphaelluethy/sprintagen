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

		const seedTickets = [
			{
				id: crypto.randomUUID(),
				externalId: "JIRA-123",
				provider: "jira" as TicketProvider,
				title: "Fix authentication bug in login flow",
				description:
					"Users are experiencing issues when logging in with OAuth providers. The callback handler is not properly validating tokens.",
				status: "in_progress" as TicketStatus,
				priority: "high" as TicketPriority,
				assignee: "alice@example.com",
				labels: ["bug", "auth", "critical"],
				metadata: {
					jiraIssueType: "Bug",
					jiraProject: "PROJ",
					jiraReporter: "bob@example.com",
				},
				aiScore: 8.5,
				createdAt: daysAgo(5),
				lastSyncedAt: secondsAgo(60 * 60),
			},
			{
				id: crypto.randomUUID(),
				externalId: "LIN-456",
				provider: "linear" as TicketProvider,
				title: "Implement dark mode toggle",
				description:
					"Add a theme switcher component that allows users to toggle between light and dark modes. Should persist preference in localStorage.",
				status: "open" as TicketStatus,
				priority: "medium" as TicketPriority,
				assignee: null,
				labels: ["feature", "ui", "enhancement"],
				metadata: {
					linearTeam: "Frontend",
					linearEstimate: 3,
				},
				aiScore: 6.2,
				createdAt: daysAgo(3),
				lastSyncedAt: secondsAgo(60 * 120),
			},
			{
				id: crypto.randomUUID(),
				externalId: null,
				provider: "manual" as TicketProvider,
				title: "Update documentation for API endpoints",
				description:
					"Documentation is outdated. Need to update OpenAPI specs and add examples for all endpoints.",
				status: "review" as TicketStatus,
				priority: "low" as TicketPriority,
				assignee: "bob@example.com",
				labels: ["documentation", "api"],
				metadata: {},
				aiScore: 4.1,
				createdAt: daysAgo(7),
				lastSyncedAt: null,
			},
			{
				id: crypto.randomUUID(),
				externalId: "DOCKER-789",
				provider: "docker" as TicketProvider,
				title: "Optimize Docker image build time",
				description:
					"Current build takes 15 minutes. Investigate layer caching and multi-stage builds to reduce time.",
				status: "done" as TicketStatus,
				priority: "medium" as TicketPriority,
				assignee: "alice@example.com",
				labels: ["devops", "docker", "performance"],
				metadata: {
					dockerImage: "app:latest",
					dockerRegistry: "registry.example.com",
				},
				aiScore: 7.3,
				createdAt: daysAgo(10),
				lastSyncedAt: daysAgo(1),
			},
			{
				id: crypto.randomUUID(),
				externalId: "JIRA-124",
				provider: "jira" as TicketProvider,
				title: "Add unit tests for payment processing",
				description:
					"Critical payment flow lacks test coverage. Need comprehensive unit tests for all payment scenarios.",
				status: "open" as TicketStatus,
				priority: "urgent" as TicketPriority,
				assignee: null,
				labels: ["testing", "payment", "critical"],
				metadata: {
					jiraIssueType: "Task",
					jiraProject: "PROJ",
				},
				aiScore: 9.1,
				createdAt: daysAgo(2),
				lastSyncedAt: secondsAgo(60 * 30),
			},
			{
				id: crypto.randomUUID(),
				externalId: "LIN-457",
				provider: "linear" as TicketProvider,
				title: "Refactor user service to use dependency injection",
				description:
					"Current implementation has tight coupling. Refactor to use DI pattern for better testability.",
				status: "in_progress" as TicketStatus,
				priority: "medium" as TicketPriority,
				assignee: "alice@example.com",
				labels: ["refactor", "architecture"],
				metadata: {
					linearTeam: "Backend",
					linearEstimate: 5,
				},
				aiScore: 5.8,
				createdAt: daysAgo(4),
				lastSyncedAt: secondsAgo(60 * 90),
			},
			{
				id: crypto.randomUUID(),
				externalId: null,
				provider: "manual" as TicketProvider,
				title: "Set up CI/CD pipeline for staging environment",
				description:
					"Configure GitHub Actions to automatically deploy to staging on merge to develop branch.",
				status: "done" as TicketStatus,
				priority: "high" as TicketPriority,
				assignee: "bob@example.com",
				labels: ["ci/cd", "devops"],
				metadata: {},
				aiScore: 7.9,
				createdAt: daysAgo(12),
				lastSyncedAt: null,
			},
			{
				id: crypto.randomUUID(),
				externalId: "LIN-458",
				provider: "linear" as TicketProvider,
				title: "Fix memory leak in data processing module",
				description:
					"Memory usage grows over time when processing large datasets. Need to identify and fix the leak.",
				status: "closed" as TicketStatus,
				priority: "high" as TicketPriority,
				assignee: "alice@example.com",
				labels: ["bug", "performance", "memory"],
				metadata: {
					linearTeam: "Backend",
					linearEstimate: 8,
				},
				aiScore: 8.7,
				createdAt: daysAgo(20),
				lastSyncedAt: daysAgo(2),
			},
			{
				id: crypto.randomUUID(),
				externalId: null,
				provider: "manual" as TicketProvider,
				title: "Create onboarding guide for new developers",
				description:
					"Document the setup process, coding standards, and common workflows for new team members.",
				status: "open" as TicketStatus,
				priority: "low" as TicketPriority,
				assignee: null,
				labels: ["documentation", "onboarding"],
				metadata: {},
				aiScore: 3.5,
				createdAt: daysAgo(1),
				lastSyncedAt: null,
			},
			{
				id: crypto.randomUUID(),
				externalId: "JIRA-125",
				provider: "jira" as TicketProvider,
				title: "Implement rate limiting for API endpoints",
				description:
					"Add rate limiting middleware to prevent abuse. Use Redis for distributed rate limiting.",
				status: "review" as TicketStatus,
				priority: "medium" as TicketPriority,
				assignee: "bob@example.com",
				labels: ["security", "api", "infrastructure"],
				metadata: {
					jiraIssueType: "Story",
					jiraProject: "PROJ",
				},
				aiScore: 6.9,
				createdAt: daysAgo(6),
				lastSyncedAt: secondsAgo(60 * 180),
			},
		];

		await db.insert(tickets).values(seedTickets);
		console.log(`✅ Inserted ${seedTickets.length} tickets`);

		// ========================================================================
		// Step 8: Insert ticket messages (conversations)
		// ========================================================================
		console.log("💬 Inserting ticket messages...");

		const ticket1 = seedTickets[0]; // High priority auth bug
		const ticket2 = seedTickets[1]; // Dark mode feature
		const ticket4 = seedTickets[3]; // Docker optimization

		if (!ticket1 || !ticket2 || !ticket4) {
			throw new Error("Required tickets not found for message seeding");
		}

		const seedMessages = [
			// Conversation for ticket 1 (auth bug)
			{
				id: crypto.randomUUID(),
				ticketId: ticket1.id,
				role: "user" as const,
				content: "I'm seeing authentication failures. Can you investigate?",
				modelUsed: null,
				createdAt: daysAndSecondsAgo(5, -60 * 60),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticket1.id,
				role: "assistant" as const,
				content:
					"I've analyzed the authentication flow. The issue appears to be in the OAuth callback handler where token validation is failing. I recommend checking the token signature verification logic.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(5, -60 * 62),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticket1.id,
				role: "user" as const,
				content: "Thanks! I'll check the signature verification.",
				modelUsed: null,
				createdAt: daysAndSecondsAgo(5, -60 * 63),
			},
			// Conversation for ticket 2 (dark mode)
			{
				id: crypto.randomUUID(),
				ticketId: ticket2.id,
				role: "user" as const,
				content: "What's the best approach for implementing dark mode?",
				modelUsed: null,
				createdAt: daysAndSecondsAgo(3, -60 * 30),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticket2.id,
				role: "assistant" as const,
				content:
					"For dark mode, I recommend using CSS variables with a theme provider. You can use next-themes library which handles system preference detection and persistence. Store the preference in localStorage and apply it via a data attribute on the html element.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(3, -60 * 32),
			},
			// Conversation for ticket 4 (Docker)
			{
				id: crypto.randomUUID(),
				ticketId: ticket4.id,
				role: "user" as const,
				content: "Build time is too slow. Any suggestions?",
				modelUsed: null,
				createdAt: daysAndSecondsAgo(10, -60 * 120),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticket4.id,
				role: "assistant" as const,
				content:
					"To optimize Docker build time: 1) Use multi-stage builds to reduce final image size, 2) Order Dockerfile commands to maximize layer caching (dependencies before code), 3) Use .dockerignore to exclude unnecessary files, 4) Consider BuildKit for parallel builds.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(10, -60 * 122),
			},
		];

		await db.insert(ticketMessages).values(seedMessages);
		console.log(`✅ Inserted ${seedMessages.length} ticket messages`);

		// ========================================================================
		// Step 9: Insert ticket recommendations
		// ========================================================================
		console.log("💡 Inserting ticket recommendations...");

		const ticket5 = seedTickets[4]; // Payment tests
		if (!ticket5) {
			throw new Error("Required ticket not found for recommendation seeding");
		}

		const seedRecommendations = [
			{
				id: crypto.randomUUID(),
				ticketId: ticket1.id,
				recommendedSteps:
					"1. Review OAuth callback handler code\n2. Add logging for token validation failures\n3. Test with different OAuth providers\n4. Update error handling to provide better user feedback",
				recommendedProgrammer: "alice@example.com",
				reasoning:
					"This ticket requires deep understanding of authentication flows. Alice has experience with OAuth implementations and security best practices.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(5, -60 * 67),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticket2.id,
				recommendedSteps:
					"1. Install next-themes package\n2. Create ThemeProvider component\n3. Add theme toggle button to header\n4. Define CSS variables for light/dark themes\n5. Test across different browsers",
				recommendedProgrammer: null,
				reasoning:
					"This is a straightforward UI enhancement that any frontend developer can handle. No specific expertise required.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(3, -60 * 33),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticket5.id,
				recommendedSteps:
					"1. Set up test framework (Jest/Vitest)\n2. Mock payment gateway responses\n3. Write tests for success scenarios\n4. Write tests for failure scenarios\n5. Add edge case coverage\n6. Set up CI to run tests automatically",
				recommendedProgrammer: "alice@example.com",
				reasoning:
					"Payment processing requires careful testing. Alice has experience with financial systems and understands the importance of comprehensive test coverage.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(2, -60 * 60),
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

		const ticket3 = seedTickets[2]; // Documentation
		if (!ticket3) {
			throw new Error("Required ticket not found for ranking seeding");
		}

		const seedRankings = [
			{
				id: crypto.randomUUID(),
				ticketId: ticket1.id,
				urgencyScore: 9.0,
				impactScore: 8.5,
				complexityScore: 6.5,
				overallScore: 8.5,
				reasoning:
					"High urgency due to blocking user authentication. High impact as it affects all users. Moderate complexity as it's a focused bug fix.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(5, -60 * 83),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticket2.id,
				urgencyScore: 4.0,
				impactScore: 6.0,
				complexityScore: 5.0,
				overallScore: 6.2,
				reasoning:
					"Low urgency as it's a feature enhancement. Moderate impact improving user experience. Low to moderate complexity.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(3, -60 * 50),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticket5.id,
				urgencyScore: 9.5,
				impactScore: 9.0,
				complexityScore: 7.0,
				overallScore: 9.1,
				reasoning:
					"Very high urgency for payment-related code. Critical impact on financial transactions. Moderate complexity requiring comprehensive test coverage.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(2, -60 * 67),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticket3.id,
				urgencyScore: 3.0,
				impactScore: 5.0,
				complexityScore: 4.0,
				overallScore: 4.1,
				reasoning:
					"Low urgency documentation task. Moderate impact on developer onboarding. Low complexity.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(7, -60 * 30),
			},
			{
				id: crypto.randomUUID(),
				ticketId: ticket4.id,
				urgencyScore: 5.0,
				impactScore: 7.0,
				complexityScore: 6.0,
				overallScore: 7.3,
				reasoning:
					"Moderate urgency for performance improvement. High impact on developer productivity. Moderate complexity requiring Docker expertise.",
				modelUsed: "grok-4.1-fast",
				createdAt: daysAndSecondsAgo(10, -60 * 133),
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
