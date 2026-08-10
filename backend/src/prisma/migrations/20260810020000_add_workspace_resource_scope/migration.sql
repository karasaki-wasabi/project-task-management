-- Workspace ownership for Case / Task / RecurringTaskTemplate / NonBusinessDay /
-- DevelopmentStage (workspace-resource-scope task 1.5).
-- Development data is discarded before adding NOT NULL workspace_id.
-- Hand-written (not `prisma migrate dev`) so STORED GENERATED COLUMN unique
-- indexes on tasks / non_business_days are not dropped as drift.
-- Prefer `prisma migrate deploy` for apply.
-- WARNING: running `prisma migrate dev` against NonBusinessDay may detect
-- date_active_key / its unique index as schema drift and generate a follow-up
-- that drops them. Re-verify `SHOW CREATE TABLE non_business_days` after any
-- future `prisma migrate dev` run touching this table.

-- Delete existing domain rows (FK order: Task first).
DELETE FROM `tasks`;
DELETE FROM `cases`;
DELETE FROM `recurring_task_templates`;
DELETE FROM `non_business_days`;
DELETE FROM `development_stages`;

-- AlterTable: cases
ALTER TABLE `cases` ADD COLUMN `workspace_id` VARCHAR(191) NOT NULL;
CREATE INDEX `cases_workspace_id_idx` ON `cases`(`workspace_id`);
ALTER TABLE `cases` ADD CONSTRAINT `cases_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: tasks
ALTER TABLE `tasks` ADD COLUMN `workspace_id` VARCHAR(191) NOT NULL;
CREATE INDEX `tasks_workspace_id_idx` ON `tasks`(`workspace_id`);
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: recurring_task_templates
ALTER TABLE `recurring_task_templates` ADD COLUMN `workspace_id` VARCHAR(191) NOT NULL;
CREATE INDEX `recurring_task_templates_workspace_id_idx` ON `recurring_task_templates`(`workspace_id`);
ALTER TABLE `recurring_task_templates` ADD CONSTRAINT `recurring_task_templates_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: non_business_days
-- Replace global date_active_key UNIQUE with workspace-scoped UNIQUE.
-- date_active_key itself stays the existing STORED GENERATED COLUMN.
ALTER TABLE `non_business_days` ADD COLUMN `workspace_id` VARCHAR(191) NOT NULL;
DROP INDEX `non_business_days_date_active_key_key` ON `non_business_days`;
CREATE UNIQUE INDEX `non_business_days_workspace_id_date_active_key_key` ON `non_business_days`(`workspace_id`, `date_active_key`);
CREATE INDEX `non_business_days_workspace_id_idx` ON `non_business_days`(`workspace_id`);
ALTER TABLE `non_business_days` ADD CONSTRAINT `non_business_days_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: development_stages
ALTER TABLE `development_stages` ADD COLUMN `workspace_id` VARCHAR(191) NOT NULL;
CREATE INDEX `development_stages_workspace_id_idx` ON `development_stages`(`workspace_id`);
ALTER TABLE `development_stages` ADD CONSTRAINT `development_stages_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
