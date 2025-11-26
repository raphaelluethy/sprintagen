import { relations, sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";

/**
 * Multi-project schema prefix helper
 */

// ============================================================================
// Ticket System Tables
// ============================================================================

export const ticketProviderEnum = [
    "jira",
    "linear",
    "docker",
    "manual",
] as const;
export type TicketProvider = (typeof ticketProviderEnum)[number];

export const ticketStatusEnum = [
    "open",
    "in_progress",
    "review",
    "done",
    "closed",
] as const;
export type TicketStatus = (typeof ticketStatusEnum)[number];

export const ticketPriorityEnum = ["low", "medium", "high", "urgent"] as const;
export type TicketPriority = (typeof ticketPriorityEnum)[number];

export const tickets = sqliteTable(
    "ticket",
    (d) => ({
        id: d
            .text({ length: 255 })
            .notNull()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        externalId: d.text({ length: 255 }),
        provider: d.text({ length: 50 }).notNull().$type<TicketProvider>(),
        title: d.text({ length: 500 }).notNull(),
        description: d.text(),
        status: d
            .text({ length: 50 })
            .notNull()
            .$type<TicketStatus>()
            .default("open"),
        priority: d
            .text({ length: 50 })
            .$type<TicketPriority>()
            .default("medium"),
        assignee: d.text({ length: 255 }),
        labels: d.text({ mode: "json" }).$type<string[]>().default([]),
        metadata: d
            .text({ mode: "json" })
            .$type<Record<string, unknown>>()
            .default({}),
        aiScore: d.real(),
        createdAt: d
            .integer({ mode: "timestamp" })
            .default(sql`(unixepoch())`)
            .notNull(),
        updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
        lastSyncedAt: d.integer({ mode: "timestamp" }),
    }),
    (t) => [
        index("ticket_provider_idx").on(t.provider),
        index("ticket_status_idx").on(t.status),
        index("ticket_external_id_idx").on(t.externalId),
        index("ticket_ai_score_idx").on(t.aiScore),
    ]
);

export const ticketRelations = relations(tickets, ({ many }) => ({
    recommendations: many(ticketRecommendations),
    messages: many(ticketMessages),
    rankings: many(ticketRankings),
}));

export const ticketRecommendations = sqliteTable(
    "ticket_recommendation",
    (d) => ({
        id: d
            .text({ length: 255 })
            .notNull()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        ticketId: d
            .text({ length: 255 })
            .notNull()
            .references(() => tickets.id, { onDelete: "cascade" }),
        recommendedSteps: d.text(),
        recommendedProgrammer: d.text({ length: 255 }),
        reasoning: d.text(),
        modelUsed: d.text({ length: 100 }),
        createdAt: d
            .integer({ mode: "timestamp" })
            .default(sql`(unixepoch())`)
            .notNull(),
        updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
    }),
    (t) => [index("recommendation_ticket_idx").on(t.ticketId)]
);

export const ticketRecommendationRelations = relations(
    ticketRecommendations,
    ({ one }) => ({
        ticket: one(tickets, {
            fields: [ticketRecommendations.ticketId],
            references: [tickets.id],
        }),
    })
);

export const ticketMessageRoleEnum = ["user", "assistant", "system"] as const;
export type TicketMessageRole = (typeof ticketMessageRoleEnum)[number];

export const ticketMessages = sqliteTable(
    "ticket_message",
    (d) => ({
        id: d
            .text({ length: 255 })
            .notNull()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        ticketId: d
            .text({ length: 255 })
            .notNull()
            .references(() => tickets.id, { onDelete: "cascade" }),
        role: d.text({ length: 50 }).notNull().$type<TicketMessageRole>(),
        content: d.text().notNull(),
        modelUsed: d.text({ length: 100 }),
        createdAt: d
            .integer({ mode: "timestamp" })
            .default(sql`(unixepoch())`)
            .notNull(),
    }),
    (t) => [
        index("message_ticket_idx").on(t.ticketId),
        index("message_created_idx").on(t.createdAt),
    ]
);

export const ticketMessageRelations = relations(ticketMessages, ({ one }) => ({
    ticket: one(tickets, {
        fields: [ticketMessages.ticketId],
        references: [tickets.id],
    }),
}));

export const ticketRankings = sqliteTable(
    "ticket_ranking",
    (d) => ({
        id: d
            .text({ length: 255 })
            .notNull()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        ticketId: d
            .text({ length: 255 })
            .notNull()
            .references(() => tickets.id, { onDelete: "cascade" }),
        urgencyScore: d.real().notNull().default(0),
        impactScore: d.real().notNull().default(0),
        complexityScore: d.real().notNull().default(0),
        overallScore: d.real().notNull().default(0),
        reasoning: d.text(),
        modelUsed: d.text({ length: 100 }),
        createdAt: d
            .integer({ mode: "timestamp" })
            .default(sql`(unixepoch())`)
            .notNull(),
    }),
    (t) => [
        index("ranking_ticket_idx").on(t.ticketId),
        index("ranking_overall_idx").on(t.overallScore),
    ]
);

export const ticketRankingRelations = relations(ticketRankings, ({ one }) => ({
    ticket: one(tickets, {
        fields: [ticketRankings.ticketId],
        references: [tickets.id],
    }),
}));

// ============================================================================
// Posts example table (original)
// ============================================================================

export const posts = sqliteTable(
    "post",
    (d) => ({
        id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
        name: d.text({ length: 256 }),
        createdById: d
            .text({ length: 255 })
            .notNull()
            .references(() => user.id),
        createdAt: d
            .integer({ mode: "timestamp" })
            .default(sql`(unixepoch())`)
            .notNull(),
        updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
    }),
    (t) => [
        index("created_by_idx").on(t.createdById),
        index("name_idx").on(t.name),
    ]
);

// Better Auth core tables
export const user = sqliteTable("user", (d) => ({
    id: d
        .text({ length: 255 })
        .notNull()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: d.text({ length: 255 }),
    email: d.text({ length: 255 }).notNull().unique(),
    emailVerified: d.integer({ mode: "boolean" }).default(false),
    image: d.text({ length: 255 }),
    createdAt: d
        .integer({ mode: "timestamp" })
        .default(sql`(unixepoch())`)
        .notNull(),
    updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));

export const userRelations = relations(user, ({ many }) => ({
    account: many(account),
    session: many(session),
}));

export const account = sqliteTable(
    "account",
    (d) => ({
        id: d
            .text({ length: 255 })
            .notNull()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        userId: d
            .text({ length: 255 })
            .notNull()
            .references(() => user.id),
        accountId: d.text({ length: 255 }).notNull(),
        providerId: d.text({ length: 255 }).notNull(),
        accessToken: d.text(),
        refreshToken: d.text(),
        accessTokenExpiresAt: d.integer({ mode: "timestamp" }),
        refreshTokenExpiresAt: d.integer({ mode: "timestamp" }),
        scope: d.text({ length: 255 }),
        idToken: d.text(),
        password: d.text(),
        createdAt: d
            .integer({ mode: "timestamp" })
            .default(sql`(unixepoch())`)
            .notNull(),
        updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
    }),
    (t) => [index("account_user_id_idx").on(t.userId)]
);

export const accountRelations = relations(account, ({ one }) => ({
    user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const session = sqliteTable(
    "session",
    (d) => ({
        id: d
            .text({ length: 255 })
            .notNull()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        userId: d
            .text({ length: 255 })
            .notNull()
            .references(() => user.id),
        token: d.text({ length: 255 }).notNull().unique(),
        expiresAt: d.integer({ mode: "timestamp" }).notNull(),
        ipAddress: d.text({ length: 255 }),
        userAgent: d.text({ length: 255 }),
        createdAt: d
            .integer({ mode: "timestamp" })
            .default(sql`(unixepoch())`)
            .notNull(),
        updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
    }),
    (t) => [index("session_user_id_idx").on(t.userId)]
);

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const verification = sqliteTable(
    "verification",
    (d) => ({
        id: d
            .text({ length: 255 })
            .notNull()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        identifier: d.text({ length: 255 }).notNull(),
        value: d.text({ length: 255 }).notNull(),
        expiresAt: d.integer({ mode: "timestamp" }).notNull(),
        createdAt: d
            .integer({ mode: "timestamp" })
            .default(sql`(unixepoch())`)
            .notNull(),
        updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
    }),
    (t) => [index("verification_identifier_idx").on(t.identifier)]
);
