import { describe, expect, it, vi } from "vitest";
import { connectDatabaseWithRetry } from "../../src/database/connect-with-retry.js";

describe("connectDatabaseWithRetry", () => {
    it("conecta, valida e calibra na primeira tentativa sem aguardar", async () => {
        const connect = vi.fn().mockResolvedValue(undefined);
        const ping = vi.fn().mockResolvedValue(undefined);
        const calibrateClock = vi.fn().mockResolvedValue(0);
        const isClockCalibrated = vi.fn().mockReturnValue(true);
        const sleep = vi.fn().mockResolvedValue(undefined);
        const onRetry = vi.fn();

        await connectDatabaseWithRetry({
            connect,
            ping,
            calibrateClock,
            isClockCalibrated,
            sleep,
            onRetry,
        });

        expect(connect).toHaveBeenCalledTimes(1);
        expect(ping).toHaveBeenCalledTimes(1);
        expect(calibrateClock).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
        expect(onRetry).not.toHaveBeenCalled();
    });

    it("repete com backoff exponencial limitado quando há falha transitória", async () => {
        const connect = vi
            .fn()
            .mockRejectedValueOnce(new Error("compute suspended"))
            .mockResolvedValue(undefined);
        const ping = vi
            .fn()
            .mockRejectedValueOnce(new Error("timeout"))
            .mockResolvedValue(undefined);
        const calibrateClock = vi.fn().mockResolvedValue(12);
        const isClockCalibrated = vi
            .fn()
            .mockReturnValueOnce(false)
            .mockReturnValue(true);
        const sleep = vi.fn().mockResolvedValue(undefined);
        const onRetry = vi.fn();

        await connectDatabaseWithRetry({
            connect,
            ping,
            calibrateClock,
            isClockCalibrated,
            maxAttempts: 4,
            initialDelayMs: 500,
            maxDelayMs: 1200,
            backoffFactor: 2,
            sleep,
            onRetry,
        });

        expect(connect).toHaveBeenCalledTimes(4);
        expect(sleep).toHaveBeenNthCalledWith(1, 500);
        expect(sleep).toHaveBeenNthCalledWith(2, 1000);
        expect(sleep).toHaveBeenNthCalledWith(3, 1200);
        expect(onRetry).toHaveBeenCalledTimes(3);
    });

    it("propaga o último erro quando todas as tentativas falham", async () => {
        const finalError = new Error("database unreachable");
        const connect = vi.fn().mockRejectedValue(finalError);
        const ping = vi.fn();
        const calibrateClock = vi.fn();
        const isClockCalibrated = vi.fn().mockReturnValue(false);
        const sleep = vi.fn().mockResolvedValue(undefined);

        await expect(
            connectDatabaseWithRetry({
                connect,
                ping,
                calibrateClock,
                isClockCalibrated,
                maxAttempts: 3,
                initialDelayMs: 100,
                sleep,
            }),
        ).rejects.toThrow("database unreachable");

        expect(connect).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledTimes(2);
    });

    it("usa padrão moderado de 5 tentativas com backoff exponencial limitado (16,5s totais) para cold start do Neon", async () => {
        const connect = vi.fn().mockRejectedValue(new Error("waking compute"));
        const ping = vi.fn();
        const calibrateClock = vi.fn();
        const isClockCalibrated = vi.fn().mockReturnValue(false);
        const sleep = vi.fn().mockResolvedValue(undefined);
        const onRetry = vi.fn();

        await expect(
            connectDatabaseWithRetry({
                connect,
                ping,
                calibrateClock,
                isClockCalibrated,
                sleep,
                onRetry,
            }),
        ).rejects.toThrow("waking compute");

        expect(connect).toHaveBeenCalledTimes(5);
        expect(onRetry).toHaveBeenCalledTimes(4);
        expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([
            1500, 3000, 6000, 6000,
        ]);
    });
});
