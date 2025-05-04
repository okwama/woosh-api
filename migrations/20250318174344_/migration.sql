/*
  Warnings:

  - You are about to drop the column `userId` on the `outlet` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `outlet` DROP FOREIGN KEY `Outlet_userId_fkey`;

-- DropIndex
DROP INDEX `Outlet_userId_fkey` ON `outlet`;

-- AlterTable
ALTER TABLE `outlet` DROP COLUMN `userId`;
