CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`canonical_url` text,
	`cover_url` text,
	`description` text,
	`subjects` text,
	`isbn` text,
	`published_year` text,
	`status` text DEFAULT 'to_read' NOT NULL,
	`interest_score` integer,
	`analysis` text,
	`connections` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`summary` text NOT NULL,
	`recommendations` text NOT NULL,
	`article_ids` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `articles` ADD `read_at` integer;