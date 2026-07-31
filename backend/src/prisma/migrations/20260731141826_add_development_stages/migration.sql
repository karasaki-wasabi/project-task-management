-- NOTE: prisma migrate dev's diff engine also tried to emit
-- `DROP INDEX non_business_days_date_active_key_key ON non_business_days`
-- here. That index protects the hand-tuned STORED GENERATED COLUMN
-- workaround from migration 20260731051829_init_domain_schema (Prisma
-- cannot express generated columns, so `date_active_key` has no `@@unique`
-- in schema.prisma and is invisible to Prisma's own drift detection). The
-- DROP was removed by hand before this migration was applied; do not let a
-- future `prisma migrate dev` run silently reintroduce it.

-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `development_stage_id` VARCHAR(191) NULL;

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

-- CreateIndex
CREATE INDEX `tasks_development_stage_id_idx` ON `tasks`(`development_stage_id`);

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_development_stage_id_fkey` FOREIGN KEY (`development_stage_id`) REFERENCES `development_stages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
