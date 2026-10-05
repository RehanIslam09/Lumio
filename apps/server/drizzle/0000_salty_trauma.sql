CREATE TABLE "project_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_versions_project_version_unique" UNIQUE("project_id","version_number"),
	CONSTRAINT "project_versions_version_number_check" CHECK ("version_number" >= 1),
	CONSTRAINT "project_versions_schema_version_check" CHECK ("schema_version" >= 1),
	CONSTRAINT "project_versions_document_object_check" CHECK (jsonb_typeof("document") = 'object'),
	CONSTRAINT "project_versions_document_size_check" CHECK (octet_length("document"::text) <= 5000000)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_length_check" CHECK (char_length(btrim("name")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_normalized_check" CHECK ("email" = lower(btrim("email"))),
	CONSTRAINT "users_email_shape_check" CHECK (char_length("email") between 3 and 254 and position('@' in "email") > 1),
	CONSTRAINT "users_password_hash_not_empty_check" CHECK (char_length("password_hash") > 0)
);
--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_versions_created_by_idx" ON "project_versions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "projects_owner_updated_idx" ON "projects" USING btree ("owner_id","updated_at" DESC NULLS LAST);