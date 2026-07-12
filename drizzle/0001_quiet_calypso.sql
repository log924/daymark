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
