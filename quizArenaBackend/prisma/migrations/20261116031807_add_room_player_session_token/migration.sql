/*
  Warnings:

  - A unique constraint covering the columns `[sessionTokenHash]` on the table `room_players` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "room_players" ADD COLUMN     "sessionTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "room_players_sessionTokenHash_key" ON "room_players"("sessionTokenHash");
