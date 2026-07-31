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
CREATE TABLE `deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `due_date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `deliveries_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tasks` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `status` ENUM('not_started', 'in_progress', 'done', 'on_hold') NOT NULL DEFAULT 'not_started',
    `priority` ENUM('high', 'medium', 'low') NOT NULL,
    `memo` TEXT NULL,
    `delivery_id` VARCHAR(191) NULL,
    `is_required_for_delivery` BOOLEAN NOT NULL DEFAULT false,
    `parent_task_id` VARCHAR(191) NULL,
    `assignee_user_id` VARCHAR(191) NULL,
    `source_template_id` VARCHAR(191) NULL,
    `scheduled_date` DATE NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `tasks_delivery_id_idx`(`delivery_id`),
    INDEX `tasks_parent_task_id_idx`(`parent_task_id`),
    INDEX `tasks_completed_at_idx`(`completed_at`),
    INDEX `tasks_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `tasks_source_template_id_scheduled_date_key`(`source_template_id`, `scheduled_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `occurs_at` DATETIME(3) NOT NULL,
    `delivery_id` VARCHAR(191) NULL,
    `assignee_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `events_delivery_id_idx`(`delivery_id`),
    INDEX `events_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recurring_task_templates` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `priority` ENUM('high', 'medium', 'low') NOT NULL,
    `kind` ENUM('fixed_interval', 'delivery_relative') NOT NULL,
    `interval_unit` ENUM('day', 'week', 'month') NULL,
    `interval_value` INTEGER NULL,
    `bound_delivery_id` VARCHAR(191) NULL,
    `delivery_offset_days` INTEGER NULL,
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
-- one-active-record-per-date and allows re-registering a date after deletion
-- (MySQL treats NULL as distinct across rows in a UNIQUE INDEX).
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

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_delivery_id_fkey` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_parent_task_id_fkey` FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_assignee_user_id_fkey` FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_source_template_id_fkey` FOREIGN KEY (`source_template_id`) REFERENCES `recurring_task_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_delivery_id_fkey` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_assignee_user_id_fkey` FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurring_task_templates` ADD CONSTRAINT `recurring_task_templates_bound_delivery_id_fkey` FOREIGN KEY (`bound_delivery_id`) REFERENCES `deliveries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
