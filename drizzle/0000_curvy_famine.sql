CREATE TABLE `article_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`provider` text NOT NULL,
	`summary` text,
	`translation_zh` text,
	`score` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`title` text NOT NULL,
	`canonical_url` text NOT NULL,
	`content` text,
	`published_at` integer,
	`saved_at` integer,
	`read_at` integer,
	`status` text DEFAULT 'new' NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
