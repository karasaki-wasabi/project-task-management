-- Single init migration for the full domain schema.
-- Policy: .kiro/steering/prisma-migrations.md
-- Do not add follow-up migration directories. On schema change, regenerate this
-- file from schema.prisma (empty → current), hand-edit generated columns, then
-- `prisma migrate reset`. Never use `prisma migrate dev` to append diffs.
--
-- Hand-edited STORED GENERATED COLUMNS (Prisma cannot express these; see
-- schema.prisma comments and [[local-dev-pitfalls]] item 6):
-- - `tasks.template_case_date_active_key` + UNIQUE
-- - `non_business_days.date_active_key` + UNIQUE (`workspace_id`, `date_active_key`)
-- WARNING: `prisma migrate dev` may treat these as drift and emit DROP SQL.
-- Prefer reset + this file; re-verify with `SHOW CREATE TABLE` after changes.

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspaces` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#2563eb',
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `workspaces_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_members` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `workspace_members_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `workspace_members_workspace_id_user_id_key`(`workspace_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cases` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `start_date` DATE NULL,
    `end_date` DATETIME(3) NULL,
    `is_completed` BOOLEAN NOT NULL DEFAULT false,
    `workspace_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `cases_workspace_id_idx`(`workspace_id`),
    INDEX `cases_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
-- `template_case_date_active_key` is a STORED GENERATED COLUMN. While the row is
-- active and carries a template-generated identity (source_template_id + case_id
-- + scheduled_end_date), it stores CONCAT(...); soft-deleted or incomplete rows
-- yield NULL so the UNIQUE INDEX only enforces uniqueness among active rows.
CREATE TABLE `tasks` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `status` ENUM('not_started', 'in_progress', 'ready_for_handoff', 'on_hold') NOT NULL DEFAULT 'not_started',
    `priority` ENUM('high', 'medium', 'low') NOT NULL,
    `detail` TEXT NULL,
    `case_id` VARCHAR(191) NULL,
    `is_required_for_case` BOOLEAN NOT NULL DEFAULT false,
    `parent_task_id` VARCHAR(191) NULL,
    `assignee_user_id` VARCHAR(191) NULL,
    `source_template_id` VARCHAR(191) NULL,
    `source_anchor` ENUM('case_start', 'case_end', 'period_month_start', 'period_month_end') NULL,
    `development_stage_id` VARCHAR(191) NULL,
    `scheduled_end_date` DATE NULL,
    `completed_at` DATETIME(3) NULL,
    `workspace_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `template_case_date_active_key` VARCHAR(191) GENERATED ALWAYS AS (
        IF(
            `deleted_at` IS NULL
                AND `source_template_id` IS NOT NULL
                AND `case_id` IS NOT NULL
                AND `scheduled_end_date` IS NOT NULL,
            CONCAT(
                `source_template_id`,
                ':',
                `case_id`,
                ':',
                DATE_FORMAT(`scheduled_end_date`, '%Y-%m-%d')
            ),
            NULL
        )
    ) STORED,

    INDEX `tasks_workspace_id_idx`(`workspace_id`),
    INDEX `tasks_case_id_idx`(`case_id`),
    INDEX `tasks_parent_task_id_idx`(`parent_task_id`),
    INDEX `tasks_completed_at_idx`(`completed_at`),
    INDEX `tasks_deleted_at_idx`(`deleted_at`),
    INDEX `tasks_development_stage_id_idx`(`development_stage_id`),
    UNIQUE INDEX `tasks_template_case_date_active_key_key`(`template_case_date_active_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comments` (
    `id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `author_user_id` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `edited_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `comments_task_id_created_at_idx`(`task_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_logs` (
    `id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `actor_source_label` VARCHAR(191) NULL,
    `operation_type` ENUM('task_created', 'task_deleted', 'field_changed', 'comment_created', 'comment_edited', 'comment_deleted') NOT NULL,
    `field_name` ENUM('title', 'status', 'priority', 'detail', 'assignee', 'case', 'isRequiredForCase', 'developmentStage', 'parentTask', 'scheduledEndDate') NULL,
    `before_value` TEXT NULL,
    `after_value` TEXT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_logs_task_id_occurred_at_idx`(`task_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recurring_task_templates` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `priority` ENUM('high', 'medium', 'low') NOT NULL,
    `case_anchor` ENUM('case_start', 'case_end', 'period_month_start', 'period_month_end') NOT NULL,
    `case_offset_days` INTEGER NOT NULL,
    `default_detail` TEXT NULL,
    `non_business_day_policy` ENUM('as_is', 'skip', 'next_business_day', 'previous_business_day') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `workspace_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `recurring_task_templates_workspace_id_idx`(`workspace_id`),
    INDEX `recurring_task_templates_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
-- `date_active_key` is a STORED GENERATED COLUMN: mirrors `date` while active,
-- NULL when soft-deleted. UNIQUE is workspace-scoped.
CREATE TABLE `non_business_days` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `label` VARCHAR(191) NULL,
    `source` ENUM('manual', 'external_api') NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL,
    `date_active_key` DATE GENERATED ALWAYS AS (IF(`deleted_at` IS NULL, `date`, NULL)) STORED,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `non_business_days_workspace_id_date_active_key_key`(`workspace_id`, `date_active_key`),
    INDEX `non_business_days_workspace_id_idx`(`workspace_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `development_stages` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,
    `kind` ENUM('normal', 'completed', 'cancelled') NOT NULL DEFAULT 'normal',
    `workspace_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `development_stages_workspace_id_idx`(`workspace_id`),
    INDEX `development_stages_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `workspaces` ADD CONSTRAINT `workspaces_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cases` ADD CONSTRAINT `cases_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- MySQL forbids ON DELETE / ON UPDATE referential actions on columns that appear
-- in a STORED GENERATED COLUMN expression (`template_case_date_active_key` uses
-- case_id and source_template_id). Use plain FKs (RESTRICT) for those two.
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`);

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_parent_task_id_fkey` FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_assignee_user_id_fkey` FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_source_template_id_fkey` FOREIGN KEY (`source_template_id`) REFERENCES `recurring_task_templates`(`id`);

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_development_stage_id_fkey` FOREIGN KEY (`development_stage_id`) REFERENCES `development_stages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurring_task_templates` ADD CONSTRAINT `recurring_task_templates_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `non_business_days` ADD CONSTRAINT `non_business_days_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `development_stages` ADD CONSTRAINT `development_stages_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
