import { afterEach, describe, expect, it, vi } from "vitest";

import { RoundExpirationWorker } from "../../src/rounds/round-expiration.worker.js";
import { RoundService } from "../../src/rounds/round.service.js";

describe("RoundExpirationWorker & RoundService auto-close (Unit)", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("deve executar varredura imediata no boot (start) para encerrar rodadas expiradas e agendar ciclos periódicos", async () => {
        vi.useFakeTimers();
        const processExpiredRounds = vi.fn().mockResolvedValue(1);
        const worker = new RoundExpirationWorker({ processExpiredRounds }, 1000);

        worker.start();
        await Promise.resolve();

        expect(processExpiredRounds).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(2050);
        expect(processExpiredRounds).toHaveBeenCalledTimes(3);

        // Chamar start novamente enquanto ativo não deve duplicar timers
        worker.start();
        await vi.advanceTimersByTimeAsync(1000);
        expect(processExpiredRounds).toHaveBeenCalledTimes(4);

        await worker.stop();
        await vi.advanceTimersByTimeAsync(3000);
        expect(processExpiredRounds).toHaveBeenCalledTimes(4);
    });

    it("deve impedir ciclos sobrepostos enquanto uma varredura ainda estiver em execução e aguardar conclusão no stop()", async () => {
        let resolveFirstCycle!: (value: number) => void;
        const firstCyclePromise = new Promise<number>((resolve) => {
            resolveFirstCycle = resolve;
        });

        const processExpiredRounds = vi
            .fn()
            .mockReturnValueOnce(firstCyclePromise)
            .mockResolvedValueOnce(2);

        const worker = new RoundExpirationWorker({ processExpiredRounds }, 5000);

        const c1 = worker.runCycle();
        const c2 = worker.runCycle();

        expect(processExpiredRounds).toHaveBeenCalledTimes(1);

        const stopPromise = worker.stop();
        resolveFirstCycle(1);

        await expect(Promise.all([c1, c2])).resolves.toEqual([1, 1]);
        expect(processExpiredRounds).toHaveBeenCalledTimes(1);
        await stopPromise;

        // Após concluir, próximo ciclo volta a executar normalmente
        await expect(worker.runCycle()).resolves.toBe(2);
        expect(processExpiredRounds).toHaveBeenCalledTimes(2);
    });

    it("deve capturar erros transitórios na varredura sem derrubar os ciclos seguintes", async () => {
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});

        const processExpiredRounds = vi
            .fn()
            .mockRejectedValueOnce(new Error("Falha temporária de conexão"))
            .mockResolvedValueOnce(3);

        const worker = new RoundExpirationWorker({ processExpiredRounds }, 5000);

        await expect(worker.runCycle()).resolves.toBe(0);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

        await expect(worker.runCycle()).resolves.toBe(3);
        consoleErrorSpy.mockRestore();
    });

    it("RoundService.processExpiredRounds deve emitir round:closed e game:finished apenas quando ainda não encerrada", async () => {
        const openedAt = new Date("2026-11-19T12:00:00.000Z");
        const expiresAt = new Date("2026-11-19T12:00:30.000Z");
        const closedAt = new Date("2026-11-19T12:00:30.100Z");

        const roundBase = {
            roundNumber: 5,
            status: "CLOSED" as const,
            openedAt,
            expiresAt,
            closedAt,
            timeLimit: 30,
            game: {
                roomId: "room-uuid-1",
                players: [
                    { id: "gp-1", nickname: "Alice", score: 250 },
                    { id: "gp-2", nickname: "Bob", score: 100 },
                ],
            },
            snapshotQuestion: {
                id: "snap-q-5",
                statement: "Última pergunta",
                options: [
                    { id: "opt-1", text: "Correta", isCorrect: true },
                    { id: "opt-2", text: "Errada", isCorrect: false },
                ],
            },
            answers: [],
        };

        const roundRepositoryMock = {
            createNextRound: vi.fn(),
            findExpiredOpenRoundIds: vi
                .fn()
                .mockResolvedValue(["round-new-closed", "round-already-closed", "round-not-ready"]),
            closeRound: vi
                .fn()
                .mockResolvedValueOnce({
                    success: true,
                    alreadyClosed: false,
                    gameFinished: true,
                    round: { id: "round-new-closed", ...roundBase },
                })
                .mockResolvedValueOnce({
                    success: true,
                    alreadyClosed: true,
                    gameFinished: false,
                    round: { id: "round-already-closed", ...roundBase },
                })
                .mockResolvedValueOnce({
                    success: false,
                    reason: "ROUND_NOT_READY",
                }),
        };

        const emitted: Array<{ roomId: string; event: string; payload: unknown }> = [];
        const emitSpy = (roomId: string, event: string, payload: unknown) => {
            emitted.push({ roomId, event, payload });
        };

        const service = new RoundService(roundRepositoryMock as never, emitSpy);
        const closedCount = await service.processExpiredRounds();

        expect(closedCount).toBe(1);
        expect(emitted).toHaveLength(2);
        expect(emitted[0].roomId).toBe("room-uuid-1");
        expect(emitted[0].event).toBe("round:closed");
        expect(emitted[1]).toEqual({
            roomId: "room-uuid-1",
            event: "game:finished",
            payload: { roomId: "room-uuid-1" },
        });
    });
});
