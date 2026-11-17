

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    GameMode,
    RoomStatus,
    QuestionType,
    Prisma,
    type Room,
} from "@prisma/client";

import { RoomService } from "../../src/rooms/room.service.js";
import {
    InvalidRoomDataError,
    RoomNotFoundError,
    RoomAccessDeniedError,
    RoomNotEditableError,
    RoomNotJoinableError,
    RoomFullError,
    DuplicateNicknameError,
    RoomAuthenticationError,
} from "../../src/rooms/room.errors.js";

import type { RoomRepository } from "../../src/rooms/room.repository.js";
import type { RoomCodeGenerator } from "../../src/rooms/room-code-generator.js";
import type { RoomPlayerRepository } from "../../src/rooms/room-player.repository.js";

import {
    hashRoomPlayerSessionToken,
} from "../../src/rooms/room-player-session-token.js";

type Repository = Pick<
    RoomRepository,
    | "create"
    | "findById"
    | "findByCode"
    | "findByCodeWithLobby"
    | "update"
    | "startIfReady"
>;

type PlayerRepository = Pick<
    RoomPlayerRepository,
    "createIfRoomHasCapacity" | "findBySessionTokenHash"
>;

type CodeGenerator = Pick<RoomCodeGenerator, "generate">;

const validData = {
    hostId: "host-test-uuid",
    maxPlayers: 10,
    questionTime: 30,
    gameMode: GameMode.CLASSIC,
    questions: Array.from({ length: 5 }, (_, index) => ({
        statement: `Pergunta de teste ${index + 1}`,
        type: QuestionType.MULTIPLE_CHOICE,
        options: [
            { text: "Alternativa 1", isCorrect: true },
            { text: "Alternativa 2", isCorrect: false },
            { text: "Alternativa 3", isCorrect: false },
            { text: "Alternativa 4", isCorrect: false },
        ],
    })),
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
        findByCode: ReturnType<typeof vi.fn>;
        findByCodeWithLobby: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        startIfReady: ReturnType<typeof vi.fn>;
    };

    let playerRepository: {
        createIfRoomHasCapacity: ReturnType<typeof vi.fn>;
        findBySessionTokenHash: ReturnType<typeof vi.fn>;
    };

    let codeGenerator: {
        generate: ReturnType<typeof vi.fn>;
    };

    let jwtService: {
        verify: ReturnType<typeof vi.fn>;
    };

    let service: RoomService;
    beforeEach(() => {
        repository = {
            create: vi.fn(),
            findById: vi.fn(),
            findByCode: vi.fn(),
            findByCodeWithLobby: vi.fn(),
            update: vi.fn(),
            startIfReady: vi.fn(),
        };

        playerRepository = {
            createIfRoomHasCapacity: vi.fn(),
            findBySessionTokenHash: vi.fn(),
        };

        codeGenerator = {
            generate: vi.fn().mockResolvedValue(generatedCode),
        };

        jwtService = {
            verify: vi.fn(),
        };

        service = new RoomService(
            repository as Repository,
            codeGenerator as CodeGenerator,
            playerRepository as PlayerRepository,
            jwtService as never,
        );
    });

    describe("getRoomLobby", () => {
        const token = "token-de-teste";

        const lobbyFixture = {
            ...roomFixture,
            host: {
                id: roomFixture.hostId,
                name: "HostTeste",
            },
            players: [
                {
                    id: "player-test-uuid",
                    nickname: "JogadorTeste",
                    score: 0,
                    joinedAt: new Date("2026-11-16T00:00:00.000Z"),
                },
            ],
        };

        const playerFixture = {
            id: "player-test-uuid",
            roomId: roomFixture.id,
            userId: null,
            nickname: "JogadorTeste",
            score: 0,
            joinedAt: new Date("2026-11-16T00:00:00.000Z"),
            sessionTokenHash: hashRoomPlayerSessionToken(token),
        };

        it("deve permitir que o host consulte o lobby usando JWT", async () => {
            jwtService.verify.mockReturnValue({
                sub: roomFixture.hostId,
                role: "HOST",
            });

            repository.findByCodeWithLobby.mockResolvedValue(lobbyFixture);

            const result = await service.getRoomLobby(
                generatedCode,
                token,
            );

            expect(jwtService.verify).toHaveBeenCalledWith(token);
            expect(repository.findByCodeWithLobby).toHaveBeenCalledWith(
                generatedCode,
            );
            expect(result).toEqual(lobbyFixture);
            expect(
                playerRepository.findBySessionTokenHash,
            ).not.toHaveBeenCalled();
        });

        it("deve rejeitar JWT válido de usuário que não seja o host", async () => {
            jwtService.verify.mockReturnValue({
                sub: "another-user-uuid",
                role: "USER",
            });

            repository.findByCodeWithLobby.mockResolvedValue(lobbyFixture);

            await expect(
                service.getRoomLobby(generatedCode, token),
            ).rejects.toBeInstanceOf(RoomAccessDeniedError);

            expect(
                playerRepository.findBySessionTokenHash,
            ).not.toHaveBeenCalled();
        });

        it("deve permitir que um jogador consulte o lobby usando seu token de sessão", async () => {
            jwtService.verify.mockImplementation(() => {
                throw new Error("JWT inválido");
            });

            playerRepository.findBySessionTokenHash.mockResolvedValue(
                playerFixture,
            );

            repository.findByCodeWithLobby.mockResolvedValue(lobbyFixture);

            const result = await service.getRoomLobby(
                generatedCode,
                token,
            );

            expect(
                playerRepository.findBySessionTokenHash,
            ).toHaveBeenCalledWith(hashRoomPlayerSessionToken(token));

            expect(repository.findByCodeWithLobby).toHaveBeenCalledWith(
                generatedCode,
            );

            expect(result).toEqual(lobbyFixture);
        });

        it("deve rejeitar token de sessão inexistente", async () => {
            jwtService.verify.mockImplementation(() => {
                throw new Error("JWT inválido");
            });

            playerRepository.findBySessionTokenHash.mockResolvedValue(null);

            await expect(
                service.getRoomLobby(generatedCode, token),
            ).rejects.toBeInstanceOf(RoomAuthenticationError);

            expect(repository.findByCodeWithLobby).not.toHaveBeenCalled();
        });

        it("deve rejeitar jogador que pertence a outra sala", async () => {
            jwtService.verify.mockImplementation(() => {
                throw new Error("JWT inválido");
            });

            playerRepository.findBySessionTokenHash.mockResolvedValue({
                ...playerFixture,
                roomId: "another-room-uuid",
            });

            repository.findByCodeWithLobby.mockResolvedValue(lobbyFixture);

            await expect(
                service.getRoomLobby(generatedCode, token),
            ).rejects.toBeInstanceOf(RoomAccessDeniedError);
        });

        it("deve rejeitar consulta quando a sala não existir para o host", async () => {
            jwtService.verify.mockReturnValue({
                sub: roomFixture.hostId,
                role: "HOST",
            });

            repository.findByCodeWithLobby.mockResolvedValue(null);

            await expect(
                service.getRoomLobby(generatedCode, token),
            ).rejects.toBeInstanceOf(RoomNotFoundError);
        });
    });

    describe("createRoom", () => {
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
            const databaseError = new Error(
                "Falha de conexão com o banco",
            );

            repository.create.mockRejectedValue(databaseError);

            await expect(service.createRoom(validData)).rejects.toBe(
                databaseError,
            );
        });
    });

    describe("joinRoom", () => {
        const joinInput = {
            code: "ABC123",
            nickname: "JogadorTeste",
        };

        const createdPlayer = {
            id: "player-test-uuid",
            roomId: roomFixture.id,
            userId: null,
            nickname: "JogadorTeste",
            score: 0,
            joinedAt: new Date("2026-11-16T00:00:00.000Z"),
            sessionTokenHash: "hash-placeholder",
        };

        beforeEach(() => {
            repository.findByCode.mockResolvedValue(roomFixture);

            playerRepository.createIfRoomHasCapacity.mockImplementation(
                async (data) => ({
                    ...createdPlayer,
                    ...data,
                }),
            );
        });

        it("deve permitir a entrada de um jogador e retornar seu token de sessão", async () => {
            const result = await service.joinRoom(joinInput);

            expect(repository.findByCode).toHaveBeenCalledWith("ABC123");

            expect(
                playerRepository.createIfRoomHasCapacity,
            ).toHaveBeenCalledWith({
                roomId: roomFixture.id,
                nickname: "JogadorTeste",
                sessionTokenHash: expect.any(String),
            });

            expect(result.player).toEqual({
                id: createdPlayer.id,
                roomId: createdPlayer.roomId,
                userId: null,
                nickname: createdPlayer.nickname,
                score: 0,
                joinedAt: createdPlayer.joinedAt,
            });

            expect(result.sessionToken).toEqual(expect.any(String));

            expect(
                hashRoomPlayerSessionToken(result.sessionToken),
            ).toBe(
                playerRepository.createIfRoomHasCapacity.mock.calls[0][0]
                    .sessionTokenHash,
            );

            expect(result.player).not.toHaveProperty("sessionTokenHash");
        });

        it("deve rejeitar entrada com dados inválidos", async () => {
            await expect(
                service.joinRoom({
                    code: "ABC",
                    nickname: "JogadorTeste",
                }),
            ).rejects.toBeInstanceOf(InvalidRoomDataError);

            expect(repository.findByCode).not.toHaveBeenCalled();
            expect(
                playerRepository.createIfRoomHasCapacity,
            ).not.toHaveBeenCalled();
        });

        it("deve rejeitar entrada quando a sala não existir", async () => {
            repository.findByCode.mockResolvedValue(null);

            await expect(
                service.joinRoom(joinInput),
            ).rejects.toBeInstanceOf(RoomNotFoundError);

            expect(
                playerRepository.createIfRoomHasCapacity,
            ).not.toHaveBeenCalled();
        });

        it("deve rejeitar entrada quando a sala deixar de existir durante a operação", async () => {
            playerRepository.createIfRoomHasCapacity.mockRejectedValue(
                new Error("ROOM_NOT_FOUND"),
            );

            await expect(
                service.joinRoom(joinInput),
            ).rejects.toBeInstanceOf(RoomNotFoundError);
        });

        it("deve rejeitar entrada quando a sala não estiver aguardando jogadores", async () => {
            playerRepository.createIfRoomHasCapacity.mockRejectedValue(
                new Error("ROOM_NOT_JOINABLE"),
            );

            await expect(
                service.joinRoom(joinInput),
            ).rejects.toBeInstanceOf(RoomNotJoinableError);
        });

        it("deve rejeitar entrada quando o nickname já estiver em uso", async () => {
            playerRepository.createIfRoomHasCapacity.mockRejectedValue(
                new Error("DUPLICATE_NICKNAME"),
            );

            await expect(
                service.joinRoom(joinInput),
            ).rejects.toBeInstanceOf(DuplicateNicknameError);
        });

        it("deve rejeitar entrada quando a sala estiver lotada", async () => {
            playerRepository.createIfRoomHasCapacity.mockRejectedValue(
                new Error("ROOM_FULL"),
            );

            await expect(
                service.joinRoom(joinInput),
            ).rejects.toBeInstanceOf(RoomFullError);
        });

        it("deve converter conflito de chave única do Prisma em erro de nickname duplicado", async () => {
            const uniqueError =
                new Prisma.PrismaClientKnownRequestError(
                    "Unique constraint failed",
                    {
                        code: "P2002",
                        clientVersion: "test",
                        meta: {
                            target: ["roomId", "nickname"],
                        },
                    },
                );

            playerRepository.createIfRoomHasCapacity.mockRejectedValue(
                uniqueError,
            );

            await expect(
                service.joinRoom(joinInput),
            ).rejects.toBeInstanceOf(DuplicateNicknameError);
        });

        it("deve propagar erros inesperados ao buscar a sala", async () => {
            const databaseError = new Error(
                "Falha de conexão com o banco",
            );

            repository.findByCode.mockRejectedValue(databaseError);

            await expect(
                service.joinRoom(joinInput),
            ).rejects.toBe(databaseError);

            expect(
                playerRepository.createIfRoomHasCapacity,
            ).not.toHaveBeenCalled();
        });

        it("deve propagar erros inesperados durante a entrada", async () => {
            const databaseError = new Error(
                "Falha de conexão com o banco",
            );

            playerRepository.createIfRoomHasCapacity.mockRejectedValue(
                databaseError,
            );

            await expect(
                service.joinRoom(joinInput),
            ).rejects.toBe(databaseError);
        });

        it("deve propagar conflito de chave única do token de sessão", async () => {
            const uniqueError =
                new Prisma.PrismaClientKnownRequestError(
                    "Unique constraint failed",
                    {
                        code: "P2002",
                        clientVersion: "test",
                        meta: {
                            target: ["sessionTokenHash"],
                        },
                    },
                );

            playerRepository.createIfRoomHasCapacity.mockRejectedValue(
                uniqueError,
            );

            await expect(
                service.joinRoom(joinInput),
            ).rejects.toBe(uniqueError);
        });

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
