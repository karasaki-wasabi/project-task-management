-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `users_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cases` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `start_date` DATE NULL,
    `end_date` DATETIME(3) NULL,
    `is_completed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `cases_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tasks` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `status` ENUM('not_started', 'in_progress', 'done', 'on_hold') NOT NULL DEFAULT 'not_started',
    `priority` ENUM('high', 'medium', 'low') NOT NULL,
    `memo` TEXT NULL,
    `case_id` VARCHAR(191) NULL,
    `is_required_for_case` BOOLEAN NOT NULL DEFAULT false,
    `parent_task_id` VARCHAR(191) NULL,
    `assignee_user_id` VARCHAR(191) NULL,
    `source_template_id` VARCHAR(191) NULL,
    `development_stage_id` VARCHAR(191) NULL,
    `scheduled_date` DATE NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `tasks_case_id_idx`(`case_id`),
    INDEX `tasks_parent_task_id_idx`(`parent_task_id`),
    INDEX `tasks_completed_at_idx`(`completed_at`),
    INDEX `tasks_deleted_at_idx`(`deleted_at`),
    INDEX `tasks_development_stage_id_idx`(`development_stage_id`),
    UNIQUE INDEX `tasks_source_template_id_scheduled_date_key`(`source_template_id`, `scheduled_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `occurs_at` DATETIME(3) NOT NULL,
    `case_id` VARCHAR(191) NULL,
    `assignee_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `events_case_id_idx`(`case_id`),
    INDEX `events_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recurring_task_templates` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `priority` ENUM('high', 'medium', 'low') NOT NULL,
    `kind` ENUM('fixed_interval', 'case_relative') NOT NULL,
    `interval_unit` ENUM('day', 'week', 'month') NULL,
    `interval_value` INTEGER NULL,
    `bound_case_id` VARCHAR(191) NULL,
    `case_offset_days` INTEGER NULL,
    `default_memo` TEXT NULL,
    `non_business_day_policy` ENUM('as_is', 'skip', 'next_business_day', 'previous_business_day') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `recurring_task_templates_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
-- `date_active_key` is a STORED GENERATED COLUMN (Prisma cannot express this,
-- see schema.prisma comment): it mirrors `date` while the row is active and
-- becomes NULL once soft-deleted, so the UNIQUE INDEX below only enforces
-- date uniqueness among non-deleted rows.
-- WARNING: running `prisma migrate dev` again after this hand-edit will detect
-- the generated column/unique index as schema drift and may generate a
-- follow-up migration that drops them. Use `prisma migrate deploy` to apply
-- this migration verbatim; re-verify `SHOW CREATE TABLE non_business_days`
-- after any future `prisma migrate dev` run touching this table.
CREATE TABLE `non_business_days` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `label` VARCHAR(191) NULL,
    `source` ENUM('manual', 'external_api') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `date_active_key` DATE GENERATED ALWAYS AS (IF(`deleted_at` IS NULL, `date`, NULL)) STORED,

    UNIQUE INDEX `non_business_days_date_active_key_key`(`date_active_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `development_stages` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `development_stages_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_parent_task_id_fkey` FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_assignee_user_id_fkey` FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_source_template_id_fkey` FOREIGN KEY (`source_template_id`) REFERENCES `recurring_task_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_development_stage_id_fkey` FOREIGN KEY (`development_stage_id`) REFERENCES `development_stages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_assignee_user_id_fkey` FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurring_task_templates` ADD CONSTRAINT `recurring_task_templates_bound_case_id_fkey` FOREIGN KEY (`bound_case_id`) REFERENCES `cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
