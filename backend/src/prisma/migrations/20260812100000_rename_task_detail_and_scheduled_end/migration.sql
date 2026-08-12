-- Rename task detail / scheduled end date / template default detail columns
-- (task-field-rename task 1.1).
--
-- Hand-written (not `prisma migrate dev`) so STORED GENERATED COLUMN unique
-- indexes on tasks.template_case_date_active_key are not dropped as schema
-- drift while renaming referenced columns. Prisma schema language cannot
-- express those generated columns; `migrate dev` would detect them as drift
-- and emit a follow-up that DROPs them (see .kiro/steering/local-dev-pitfalls.md
-- item 6). Prefer `prisma migrate deploy`.
-- WARNING: do not run `prisma migrate dev` to create or re-apply this change.
-- Re-verify `SHOW CREATE TABLE tasks` after any future `prisma migrate dev`
-- run touching this table.

-- 1. Drop unique index on generated column
DROP INDEX `tasks_template_case_date_active_key_key` ON `tasks`;

-- 2. Drop generated column (must go before renaming referenced columns)
ALTER TABLE `tasks` DROP COLUMN `template_case_date_active_key`;

-- 3. Rename physical columns (values preserved)
ALTER TABLE `tasks` RENAME COLUMN `memo` TO `detail`;
ALTER TABLE `tasks` RENAME COLUMN `scheduled_date` TO `scheduled_end_date`;
ALTER TABLE `recurring_task_templates` RENAME COLUMN `default_memo` TO `default_detail`;

-- 4. Recreate STORED GENERATED COLUMN referencing scheduled_end_date
ALTER TABLE `tasks`
  ADD COLUMN `template_case_date_active_key` VARCHAR(191) GENERATED ALWAYS AS (
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
  ) STORED;

-- 5. Restore unique constraint on the generated column
CREATE UNIQUE INDEX `tasks_template_case_date_active_key_key`
  ON `tasks`(`template_case_date_active_key`);
