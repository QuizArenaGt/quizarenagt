
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Room } from "@prisma/client";

import { RoomRepository } from "../../src/rooms/room.repository.js";
import { prisma } from "../../src/database/prisma.js";

vi.mock("../../src/database/prisma.js", () => ({
    prisma: {
        $transaction: vi.fn(),
        room: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

const roomModel = prisma.room as unknown as {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
};

const transactionClient = {
    $queryRaw: vi.fn(),
    room: {
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    roomPlayer: {
        count: vi.fn(),
    },
    question: {
        findMany: vi.fn(),
    },
    roomQuestionSnapshot: {
        create: vi.fn(),
    },
    game: {
        create: vi.fn(),
    },
};

type TransactionCallback = (
    tx: typeof transactionClient,
) => Promise<unknown>;

const transactionMock = (
    prisma as unknown as {
        $transaction: ReturnType<typeof vi.fn>;
    }
).$transaction;

const roomFixture = {
    id: "room-test-uuid",
    code: "ABC123",
    hostId: "host-test-uuid",
    maxPlayers: 10,
    questionTime: 30,
    gameMode: "CLASSIC",
    status: "WAITING",
    createdAt: new Date("2026-11-08T12:00:00.000Z"),
    updatedAt: new Date("2026-11-08T12:00:00.000Z"),
} satisfies Room;

const createRoomData = {
    code: "ABC123",
    hostId: "host-test-uuid",
    maxPlayers: 10,
    questionTime: 30,
    gameMode: "CLASSIC" as const,
};

const questionsFixture = Array.from({ length: 5 }, (_, questionIndex) => ({
    id: `question-${questionIndex + 1}`,
    statement: `Pergunta ${questionIndex + 1}`,
    type: "MULTIPLE_CHOICE" as const,
    isActive: true,
    createdAt: new Date(
        `2026-11-0${questionIndex + 1}T12:00:00.000Z`,
    ),
    updatedAt: new Date("2026-11-08T12:00:00.000Z"),
    roomId: roomFixture.id,
    options: Array.from({ length: 4 }, (_, optionIndex) => ({
        id: `option-${questionIndex + 1}-${optionIndex + 1}`,
        text: `Alternativa ${optionIndex + 1}`,
        isCorrect: optionIndex === 0,
        questionId: `question-${questionIndex + 1}`,
        position: optionIndex,
    })),
}));

describe("RoomRepository", () => {
    let repository: RoomRepository;

    beforeEach(() => {
        vi.clearAllMocks();

        transactionMock.mockImplementation(
            (callback: TransactionCallback) =>
                callback(transactionClient),
        );

        transactionClient.$queryRaw.mockResolvedValue([]);

        transactionClient.room.findUnique.mockResolvedValue(roomFixture);

        transactionClient.room.update.mockResolvedValue({
            ...roomFixture,
            status: "IN_PROGRESS",
        });

        transactionClient.roomPlayer.count.mockResolvedValue(2);

        transactionClient.question.findMany.mockResolvedValue(
            questionsFixture,
        );

        transactionClient.roomQuestionSnapshot.create.mockResolvedValue({
            id: "snapshot-test-uuid",
            roomId: roomFixture.id,
        });

        transactionClient.game.create.mockResolvedValue({
            id: "game-test-uuid",
            roomId: roomFixture.id,
            startedAt: new Date("2026-11-16T12:00:00.000Z"),
            finishedAt: null,
            createdAt: new Date("2026-11-16T12:00:00.000Z"),
        });

        repository = new RoomRepository();
    });

    describe("findById", () => {
        it("deve encontrar uma sala pelo ID", async () => {
            roomModel.findUnique.mockResolvedValue(roomFixture);

            const result = await repository.findById(roomFixture.id);

            expect(roomModel.findUnique).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
            });

            expect(result).toEqual(roomFixture);
        });

        it("deve retornar null quando a sala não existir", async () => {
            roomModel.findUnique.mockResolvedValue(null);

            const result = await repository.findById("invalid-id");

            expect(result).toBeNull();
        });
    });

    describe("findByCode", () => {
        it("deve encontrar uma sala pelo código", async () => {
            roomModel.findUnique.mockResolvedValue(roomFixture);

            const result = await repository.findByCode(roomFixture.code);

            expect(roomModel.findUnique).toHaveBeenCalledWith({
                where: { code: roomFixture.code },
            });

            expect(result).toEqual(roomFixture);
        });

        it("deve retornar null quando o código não existir", async () => {
            roomModel.findUnique.mockResolvedValue(null);

            const result = await repository.findByCode("INVALID");

            expect(result).toBeNull();
        });
    });

    describe("findManyByHostId", () => {
        it("deve listar as salas de um host ordenadas por data", async () => {
            roomModel.findMany.mockResolvedValue([roomFixture]);

            const result = await repository.findManyByHostId(
                roomFixture.hostId,
            );

            expect(roomModel.findMany).toHaveBeenCalledWith({
                where: { hostId: roomFixture.hostId },
                orderBy: { createdAt: "desc" },
            });

            expect(result).toEqual([roomFixture]);
        });

        it("deve retornar uma lista vazia quando o host não possuir salas", async () => {
            roomModel.findMany.mockResolvedValue([]);

            const result = await repository.findManyByHostId(
                roomFixture.hostId,
            );

            expect(result).toEqual([]);
        });
    });

    describe("create", () => {
        it("deve criar uma sala com as configurações informadas", async () => {
            roomModel.create.mockResolvedValue(roomFixture);

            const result = await repository.create(createRoomData);

            expect(roomModel.create).toHaveBeenCalledWith({
                data: createRoomData,
            });

            expect(result).toEqual(roomFixture);
        });
    });

    describe("update", () => {
        it("deve atualizar as configurações da sala", async () => {
            const updateData = {
                maxPlayers: 15,
                questionTime: 45,
            };

            const updatedRoom = {
                ...roomFixture,
                ...updateData,
            };

            roomModel.update.mockResolvedValue(updatedRoom);

            const result = await repository.update(
                roomFixture.id,
                updateData,
            );

            expect(roomModel.update).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
                data: updateData,
            });

            expect(result).toEqual(updatedRoom);
        });
    });

    describe("updateStatus", () => {
        it("deve atualizar o status da sala", async () => {
            const updatedRoom = {
                ...roomFixture,
                status: "IN_PROGRESS" as const,
            };

            roomModel.update.mockResolvedValue(updatedRoom);

            const result = await repository.updateStatus(
                roomFixture.id,
                "IN_PROGRESS",
            );

            expect(roomModel.update).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
                data: { status: "IN_PROGRESS" },
            });

            expect(result).toEqual(updatedRoom);
        });
    });

    describe("startIfReady", () => {
        it("deve criar o snapshot e o game antes de iniciar a sala", async () => {
            const updatedRoom = {
                ...roomFixture,
                status: "IN_PROGRESS" as const,
            };

            transactionClient.room.update.mockResolvedValue(updatedRoom);

            const result = await repository.startIfReady(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(transactionMock).toHaveBeenCalled();
            expect(transactionClient.$queryRaw).toHaveBeenCalled();

            expect(transactionClient.room.findUnique).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
            });

            expect(transactionClient.roomPlayer.count).toHaveBeenCalledWith({
                where: { roomId: roomFixture.id },
            });

            expect(transactionClient.question.findMany).toHaveBeenCalledWith({
                where: {
                    roomId: roomFixture.id,
                    isActive: true,
                },
                orderBy: [
                    { createdAt: "asc" },
                    { id: "asc" },
                ],
                include: {
                    options: {
                        orderBy: { position: "asc" },
                    },
                },
            });

            expect(
                transactionClient.roomQuestionSnapshot.create,
            ).toHaveBeenCalledWith({
                data: {
                    roomId: roomFixture.id,
                    questions: {
                        create: questionsFixture.map(
                            (question, position) => ({
                                sourceQuestionId: question.id,
                                statement: question.statement,
                                type: question.type,
                                position,
                                options: {
                                    create: question.options.map(
                                        (option, optionPosition) => ({
                                            sourceOptionId: option.id,
                                            text: option.text,
                                            isCorrect: option.isCorrect,
                                            position: optionPosition,
                                        }),
                                    ),
                                },
                            }),
                        ),
                    },
                },
            });

            expect(transactionClient.game.create).toHaveBeenCalledWith({
                data: {
                    roomId: roomFixture.id,
                },
            });

            expect(transactionClient.room.update).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
                data: { status: "IN_PROGRESS" },
            });

            expect(
                transactionClient.roomQuestionSnapshot.create.mock
                    .invocationCallOrder[0],
            ).toBeLessThan(
                transactionClient.game.create.mock.invocationCallOrder[0],
            );

            expect(
                transactionClient.game.create.mock.invocationCallOrder[0],
            ).toBeLessThan(
                transactionClient.room.update.mock.invocationCallOrder[0],
            );

            expect(result).toEqual({
                success: true,
                room: updatedRoom,
            });
        });

        it("deve retornar ROOM_NOT_FOUND quando a sala não existir", async () => {
            transactionClient.room.findUnique.mockResolvedValue(null);

            const result = await repository.startIfReady(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "ROOM_NOT_FOUND",
            });

            expect(transactionClient.roomPlayer.count).not.toHaveBeenCalled();
            expect(transactionClient.question.findMany).not.toHaveBeenCalled();
            expect(
                transactionClient.roomQuestionSnapshot.create,
            ).not.toHaveBeenCalled();
            expect(transactionClient.game.create).not.toHaveBeenCalled();
            expect(transactionClient.room.update).not.toHaveBeenCalled();
        });

        it("deve retornar ACCESS_DENIED quando o usuário não for o host", async () => {
            const result = await repository.startIfReady(
                roomFixture.id,
                "other-user-id",
            );

            expect(result).toEqual({
                success: false,
                reason: "ACCESS_DENIED",
            });

            expect(transactionClient.roomPlayer.count).not.toHaveBeenCalled();
            expect(transactionClient.question.findMany).not.toHaveBeenCalled();
            expect(
                transactionClient.roomQuestionSnapshot.create,
            ).not.toHaveBeenCalled();
            expect(transactionClient.game.create).not.toHaveBeenCalled();
            expect(transactionClient.room.update).not.toHaveBeenCalled();
        });

        it("deve retornar ROOM_NOT_WAITING quando a sala não estiver aguardando", async () => {
            transactionClient.room.findUnique.mockResolvedValue({
                ...roomFixture,
                status: "IN_PROGRESS",
            });

            const result = await repository.startIfReady(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "ROOM_NOT_WAITING",
            });

            expect(transactionClient.roomPlayer.count).not.toHaveBeenCalled();
            expect(transactionClient.question.findMany).not.toHaveBeenCalled();
            expect(
                transactionClient.roomQuestionSnapshot.create,
            ).not.toHaveBeenCalled();
            expect(transactionClient.game.create).not.toHaveBeenCalled();
            expect(transactionClient.room.update).not.toHaveBeenCalled();
        });

        it("deve retornar NOT_ENOUGH_PLAYERS quando houver menos de 2 jogadores", async () => {
            transactionClient.roomPlayer.count.mockResolvedValue(1);

            const result = await repository.startIfReady(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "NOT_ENOUGH_PLAYERS",
            });

            expect(transactionClient.question.findMany).not.toHaveBeenCalled();
            expect(
                transactionClient.roomQuestionSnapshot.create,
            ).not.toHaveBeenCalled();
            expect(transactionClient.game.create).not.toHaveBeenCalled();
            expect(transactionClient.room.update).not.toHaveBeenCalled();
        });

        it("deve retornar NOT_ENOUGH_QUESTIONS quando houver menos de 5 perguntas ativas", async () => {
            transactionClient.question.findMany.mockResolvedValue(
                questionsFixture.slice(0, 4),
            );

            const result = await repository.startIfReady(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result).toEqual({
                success: false,
                reason: "NOT_ENOUGH_QUESTIONS",
            });

            expect(
                transactionClient.roomQuestionSnapshot.create,
            ).not.toHaveBeenCalled();
            expect(transactionClient.game.create).not.toHaveBeenCalled();
            expect(transactionClient.room.update).not.toHaveBeenCalled();
        });
    });
});
