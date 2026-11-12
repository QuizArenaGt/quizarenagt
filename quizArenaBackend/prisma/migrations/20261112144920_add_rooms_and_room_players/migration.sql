/*
  Warnings:

  - Added the required column `roomId` to the `questions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('CLASSIC');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "roomId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "questionTime" INTEGER NOT NULL,
    "gameMode" "GameMode" NOT NULL DEFAULT 'CLASSIC',
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_players" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT,
    "nickname" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_code_key" ON "rooms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "room_players_roomId_nickname_key" ON "room_players"("roomId", "nickname");

-- CreateIndex
CREATE UNIQUE INDEX "room_players_roomId_userId_key" ON "room_players"("roomId", "userId");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
