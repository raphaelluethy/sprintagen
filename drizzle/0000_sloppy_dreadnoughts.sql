CREATE TABLE `account` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`accountId` text(255) NOT NULL,
	`providerId` text(255) NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text(255),
	`idToken` text,
	`password` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE TABLE `post` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(256),
	`createdById` text(255) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `created_by_idx` ON `post` (`createdById`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `post` (`name`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`expiresAt` integer NOT NULL,
	`ipAddress` text(255),
	`userAgent` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `ticket_message` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`ticketId` text(255) NOT NULL,
	`role` text(50) NOT NULL,
	`content` text NOT NULL,
	`modelUsed` text(100),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`ticketId`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_ticket_idx` ON `ticket_message` (`ticketId`);--> statement-breakpoint
CREATE INDEX `message_created_idx` ON `ticket_message` (`createdAt`);--> statement-breakpoint
CREATE TABLE `ticket_ranking` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`ticketId` text(255) NOT NULL,
	`urgencyScore` real DEFAULT 0 NOT NULL,
	`impactScore` real DEFAULT 0 NOT NULL,
	`complexityScore` real DEFAULT 0 NOT NULL,
	`overallScore` real DEFAULT 0 NOT NULL,
	`reasoning` text,
	`modelUsed` text(100),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`ticketId`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ranking_ticket_idx` ON `ticket_ranking` (`ticketId`);--> statement-breakpoint
CREATE INDEX `ranking_overall_idx` ON `ticket_ranking` (`overallScore`);--> statement-breakpoint
CREATE TABLE `ticket_recommendation` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`ticketId` text(255) NOT NULL,
	`recommendedSteps` text,
	`recommendedProgrammer` text(255),
	`reasoning` text,
	`modelUsed` text(100),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`ticketId`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recommendation_ticket_idx` ON `ticket_recommendation` (`ticketId`);--> statement-breakpoint
CREATE TABLE `ticket` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`externalId` text(255),
	`provider` text(50) NOT NULL,
	`title` text(500) NOT NULL,
	`description` text,
	`status` text(50) DEFAULT 'open' NOT NULL,
	`priority` text(50) DEFAULT 'medium',
	`assignee` text(255),
	`labels` text DEFAULT '[]',
	`metadata` text DEFAULT '{}',
	`aiScore` real,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	`lastSyncedAt` integer
);
--> statement-breakpoint
CREATE INDEX `ticket_provider_idx` ON `ticket` (`provider`);--> statement-breakpoint
CREATE INDEX `ticket_status_idx` ON `ticket` (`status`);--> statement-breakpoint
CREATE INDEX `ticket_external_id_idx` ON `ticket` (`externalId`);--> statement-breakpoint
CREATE INDEX `ticket_ai_score_idx` ON `ticket` (`aiScore`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255),
	`email` text(255) NOT NULL,
	`emailVerified` integer DEFAULT false,
	`image` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`identifier` text(255) NOT NULL,
	`value` text(255) NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);