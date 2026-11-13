import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode, RoomStatus, type Room } from "@prisma/client";

import { RoomService } from "../../src/rooms/room.service.js";
import {
    InvalidRoomDataError,
    RoomNotFoundError,
    RoomAccessDeniedError,
    RoomNotEditableError,
} from "../../src/rooms/room.errors.js";
import type { RoomRepository } from "../../src/rooms/room.repository.js";
import type { RoomCodeGenerator } from "../../src/rooms/room-code-generator.js";



type Repository = Pick<
    RoomRepository,
    "create" | "findById" | "update"
>;
type CodeGenerator = Pick<RoomCodeGenerator, "generate">;

const validData = {
    hostId: "host-test-uuid",
    maxPlayers: 10,
    questionTime: 30,
    gameMode: GameMode.CLASSIC,
};

const generatedCode = "ABC123";

const roomFixture: Room = {
    id: "room-test-uuid",
    code: generatedCode,
    hostId: validData.hostId,
    maxPlayers: validData.maxPlayers,
    questionTime: validData.questionTime,
    gameMode: validData.gameMode,
    status: RoomStatus.WAITING,
    createdAt: new Date("2026-11-13T12:00:00.000Z"),
    updatedAt: new Date("2026-11-13T12:00:00.000Z"),
};

describe("RoomService", () => {
    let repository: {
        create: ReturnType<typeof vi.fn>;
        findById: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };

    let codeGenerator: {
        generate: ReturnType<typeof vi.fn>;
    };

    let service: RoomService;

    beforeEach(() => {
        repository = {
            create: vi.fn(),
            findById: vi.fn(),
            update: vi.fn(),
        };

        codeGenerator = {
            generate: vi.fn().mockResolvedValue(generatedCode),
        };

        service = new RoomService(
            repository as Repository,
            codeGenerator as CodeGenerator,
        );
    });

    it("deve criar uma sala com as configurações informadas", async () => {
        repository.create.mockResolvedValue(roomFixture);

        const result = await service.createRoom(validData);

        expect(codeGenerator.generate).toHaveBeenCalledTimes(1);
        expect(repository.create).toHaveBeenCalledTimes(1);
        expect(repository.create).toHaveBeenCalledWith({
            code: generatedCode,
            hostId: validData.hostId,
            maxPlayers: validData.maxPlayers,
            questionTime: validData.questionTime,
            gameMode: GameMode.CLASSIC,
        });
        expect(result).toEqual(roomFixture);
    });

    it("deve criar uma sala no modo HARDCORE", async () => {
        repository.create.mockResolvedValue({
            ...roomFixture,
            gameMode: GameMode.HARDCORE,
        });

        await service.createRoom({
            ...validData,
            gameMode: GameMode.HARDCORE,
        });

        expect(repository.create).toHaveBeenCalledWith({
            code: generatedCode,
            hostId: validData.hostId,
            maxPlayers: validData.maxPlayers,
            questionTime: validData.questionTime,
            gameMode: GameMode.HARDCORE,
        });
    });

    it("deve rejeitar criação quando a quantidade de jogadores for inválida", async () => {
        await expect(
            service.createRoom({
                ...validData,
                maxPlayers: 1,
            }),
        ).rejects.toBeInstanceOf(InvalidRoomDataError);

        expect(codeGenerator.generate).not.toHaveBeenCalled();
        expect(repository.create).not.toHaveBeenCalled();
    });

    it("deve rejeitar criação quando o tempo por pergunta for inválido", async () => {
        await expect(
            service.createRoom({
                ...validData,
                questionTime: 181,
            }),
        ).rejects.toBeInstanceOf(InvalidRoomDataError);

        expect(codeGenerator.generate).not.toHaveBeenCalled();
        expect(repository.create).not.toHaveBeenCalled();
    });

    it("deve rejeitar criação quando o modo de jogo for inválido", async () => {
        await expect(
            service.createRoom({
                ...validData,
                gameMode: "INVALID" as GameMode,
            }),
        ).rejects.toBeInstanceOf(InvalidRoomDataError);

        expect(codeGenerator.generate).not.toHaveBeenCalled();
        expect(repository.create).not.toHaveBeenCalled();
    });

    it("deve propagar erros inesperados do gerador de código", async () => {
        const generatorError = new Error("Falha ao gerar código");

        codeGenerator.generate.mockRejectedValue(generatorError);

        await expect(service.createRoom(validData)).rejects.toBe(
            generatorError,
        );

        expect(repository.create).not.toHaveBeenCalled();
    });

    it("deve propagar erros inesperados do repositório", async () => {
        const databaseError = new Error("Falha de conexão com o banco");

        repository.create.mockRejectedValue(databaseError);

        await expect(service.createRoom(validData)).rejects.toBe(
            databaseError,
        );
    });


    describe("updateRoom", () => {
        const updateInput = {
            roomId: roomFixture.id,
            hostId: roomFixture.hostId,
            data: {
                maxPlayers: 20,
            },
        };

        beforeEach(() => {
            repository.findById.mockResolvedValue(roomFixture);
            repository.update.mockResolvedValue({
                ...roomFixture,
                maxPlayers: 20,
            });
        });

        it("deve atualizar as configurações de uma sala", async () => {
            const result = await service.updateRoom(updateInput);

            expect(repository.findById).toHaveBeenCalledWith(
                roomFixture.id,
            );
            expect(repository.update).toHaveBeenCalledWith(
                roomFixture.id,
                { maxPlayers: 20 },
            );
            expect(result.maxPlayers).toBe(20);
        });

        it("deve atualizar somente os campos informados", async () => {
            await service.updateRoom({
                ...updateInput,
                data: {
                    questionTime: 60,
                    gameMode: GameMode.HARDCORE,
                },
            });

            expect(repository.update).toHaveBeenCalledWith(
                roomFixture.id,
                {
                    questionTime: 60,
                    gameMode: GameMode.HARDCORE,
                },
            );
        });

        it("deve rejeitar atualização com dados inválidos", async () => {
            await expect(
                service.updateRoom({
                    ...updateInput,
                    data: { maxPlayers: 1 },
                }),
            ).rejects.toBeInstanceOf(InvalidRoomDataError);

            expect(repository.findById).not.toHaveBeenCalled();
            expect(repository.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar atualização quando a sala não existir", async () => {
            repository.findById.mockResolvedValue(null);

            await expect(
                service.updateRoom(updateInput),
            ).rejects.toBeInstanceOf(RoomNotFoundError);

            expect(repository.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar atualização por usuário que não seja o host", async () => {
            await expect(
                service.updateRoom({
                    ...updateInput,
                    hostId: "another-user-uuid",
                }),
            ).rejects.toBeInstanceOf(RoomAccessDeniedError);

            expect(repository.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar atualização quando a sala não estiver aguardando jogadores", async () => {
            repository.findById.mockResolvedValue({
                ...roomFixture,
                status: RoomStatus.IN_PROGRESS,
            });

            await expect(
                service.updateRoom(updateInput),
            ).rejects.toBeInstanceOf(RoomNotEditableError);

            expect(repository.update).not.toHaveBeenCalled();
        });

        it("deve propagar erros inesperados do repositório", async () => {
            const databaseError = new Error(
                "Falha de conexão com o banco",
            );

            repository.findById.mockRejectedValue(databaseError);

            await expect(
                service.updateRoom(updateInput),
            ).rejects.toBe(databaseError);

            expect(repository.update).not.toHaveBeenCalled();
        });
    });

});
