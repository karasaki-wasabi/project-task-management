-- Existing name-only users cannot satisfy the new required account fields.
-- DELETE is safe because tasks.assignee_user_id uses ON DELETE SET NULL.
DELETE FROM `users`;

-- AlterTable
ALTER TABLE `users`
    ADD COLUMN `email` VARCHAR(191) NOT NULL,
    ADD COLUMN `password_hash` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_email_key` ON `users`(`email`);
