-- DevelopmentStage.kind + TaskStatus.done → ready_for_handoff
-- (task-status-model task 1.1).
--
-- Hand-written (not `prisma migrate dev`) so STORED GENERATED COLUMN unique
-- indexes on tasks.template_case_date_active_key and
-- non_business_days.date_active_key are not dropped as schema drift.
-- Prisma schema language cannot express those generated columns; `migrate dev`
-- would detect them as drift and emit a follow-up that DROPs them (see
-- .kiro/steering/local-dev-pitfalls.md item 6). Prefer `prisma migrate deploy`.
-- WARNING: do not run `prisma migrate dev` to create or re-apply this change.

-- AlterTable: development_stages — add kind (default normal)
ALTER TABLE `development_stages`
  ADD COLUMN `kind` ENUM('normal', 'completed', 'cancelled') NOT NULL DEFAULT 'normal';

-- Prefer promoting an existing stage named 「完了」 to completed (one per workspace)
UPDATE `development_stages` AS ds
INNER JOIN (
  SELECT `workspace_id`, MIN(`id`) AS `id`
  FROM `development_stages`
  WHERE `deleted_at` IS NULL AND `name` = '完了'
  GROUP BY `workspace_id`
) AS pick ON pick.`id` = ds.`id`
SET ds.`kind` = 'completed';

-- Insert a completed stage for each workspace that still lacks one (per-WS ids)
INSERT INTO `development_stages` (`id`, `name`, `order`, `kind`, `workspace_id`, `created_at`, `updated_at`)
SELECT
  UUID(),
  '完了',
  COALESCE(o.`max_order`, -1) + 1,
  'completed',
  w.`id`,
  NOW(3),
  NOW(3)
FROM `workspaces` AS w
LEFT JOIN (
  SELECT `workspace_id`, MAX(`order`) AS `max_order`
  FROM `development_stages`
  WHERE `deleted_at` IS NULL
  GROUP BY `workspace_id`
) AS o ON o.`workspace_id` = w.`id`
WHERE NOT EXISTS (
  SELECT 1
  FROM `development_stages` AS ds
  WHERE ds.`workspace_id` = w.`id`
    AND ds.`kind` = 'completed'
    AND ds.`deleted_at` IS NULL
);

-- Insert a cancelled stage for each workspace that lacks one (per-WS ids)
INSERT INTO `development_stages` (`id`, `name`, `order`, `kind`, `workspace_id`, `created_at`, `updated_at`)
SELECT
  UUID(),
  '中止',
  COALESCE(o.`max_order`, -1) + 1,
  'cancelled',
  w.`id`,
  NOW(3),
  NOW(3)
FROM `workspaces` AS w
LEFT JOIN (
  SELECT `workspace_id`, MAX(`order`) AS `max_order`
  FROM `development_stages`
  WHERE `deleted_at` IS NULL
  GROUP BY `workspace_id`
) AS o ON o.`workspace_id` = w.`id`
WHERE NOT EXISTS (
  SELECT 1
  FROM `development_stages` AS ds
  WHERE ds.`workspace_id` = w.`id`
    AND ds.`kind` = 'cancelled'
    AND ds.`deleted_at` IS NULL
);

-- Expand TaskStatus enum so rows can move off `done`
ALTER TABLE `tasks`
  MODIFY COLUMN `status` ENUM(
    'not_started',
    'in_progress',
    'done',
    'ready_for_handoff',
    'on_hold'
  ) NOT NULL DEFAULT 'not_started';

-- Former done tasks → that workspace's completed stage; keep completed_at; status → not_started
UPDATE `tasks` AS t
INNER JOIN `development_stages` AS ds
  ON ds.`workspace_id` = t.`workspace_id`
 AND ds.`kind` = 'completed'
 AND ds.`deleted_at` IS NULL
SET
  t.`development_stage_id` = ds.`id`,
  t.`status` = 'not_started'
WHERE t.`status` = 'done';

-- Drop old `done` value from the enum
ALTER TABLE `tasks`
  MODIFY COLUMN `status` ENUM(
    'not_started',
    'in_progress',
    'ready_for_handoff',
    'on_hold'
  ) NOT NULL DEFAULT 'not_started';
