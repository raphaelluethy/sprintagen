CREATE TABLE `opencode_session` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`ticketId` text(255),
	`sessionType` text(50) NOT NULL,
	`status` text(50) NOT NULL,
	`messages` text DEFAULT '[]',
	`metadata` text,
	`startedAt` integer DEFAULT (unixepoch()) NOT NULL,
	`completedAt` integer,
	`errorMessage` text,
	FOREIGN KEY (`ticketId`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `opencode_session_ticket_idx` ON `opencode_session` (`ticketId`);--> statement-breakpoint
CREATE INDEX `opencode_session_status_idx` ON `opencode_session` (`status`);--> statement-breakpoint
CREATE INDEX `opencode_session_started_idx` ON `opencode_session` (`startedAt`);