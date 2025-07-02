-- Modify Token table
ALTER TABLE `Token` MODIFY COLUMN `token` VARCHAR(255) NOT NULL;
ALTER TABLE `Token` MODIFY COLUMN `tokenType` VARCHAR(10) NOT NULL DEFAULT 'access';

-- Drop existing indexes
DROP INDEX `blacklisted` ON `Token`;
DROP INDEX `lastUsedAt` ON `Token`;
DROP INDEX `tokenType` ON `Token`;
DROP INDEX `Token_userId_fkey` ON `Token`;
DROP INDEX `idx_expired_tokens` ON `Token`;
DROP INDEX `idx_last_used` ON `Token`;
DROP INDEX `idx_token_validation` ON `Token`;
DROP INDEX `idx_user_tokens` ON `Token`;

-- Add new optimized indexes for Token
CREATE INDEX `idx_token_lookup` ON `Token`(`salesRepId`, `tokenType`, `blacklisted`, `expiresAt`);
CREATE INDEX `idx_token_cleanup` ON `Token`(`expiresAt`, `blacklisted`);
CREATE INDEX `idx_token_value` ON `Token`(`token`(64));

-- Add new optimized indexes for SalesRep
CREATE INDEX `idx_status_role` ON `SalesRep`(`status`, `role`);
CREATE INDEX `idx_location` ON `SalesRep`(`countryId`, `region_id`, `route_id`);
CREATE INDEX `idx_manager` ON `SalesRep`(`managerId`); 