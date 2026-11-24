import { performance } from "node:perf_hooks";
import { prisma } from "../database/prisma.js";

let isCalibrated = false;
let anchorServerEpochMs = 0;

/**
 * Indica se o relógio do servidor já foi ancorado ao PostgreSQL com `performance.now()`.
 */
export function isServerClockCalibrated(): boolean {
    return isCalibrated;
}

/**
 * Retorna o timestamp UTC atual do servidor em milissegundos.
 * Após a calibração inicial com `NOW()` do PostgreSQL, avança exclusivamente
 * via `performance.now()` (monotônico), sem depender de `Date.now()`.
 * Antes da calibração (ex.: testes unitários isolados sem boot do servidor),
 * recorre a `Date.now()`.
 */
export function getServerNowMs(
    perfNowMs: number = performance.now(),
): number {
    if (!isCalibrated) {
        return Date.now();
    }

    return Math.round(anchorServerEpochMs + perfNowMs);
}

/**
 * Retorna a instância `Date` correspondente a `getServerNowMs()`.
 */
export function getServerNowDate(
    perfNowMs: number = performance.now(),
): Date {
    return new Date(getServerNowMs(perfNowMs));
}

/**
 * Mede `NOW()` do PostgreSQL na inicialização do servidor usando o ponto médio
 * entre `performance.now()` antes e depois da consulta, estabelecendo a âncora
 * monotônica para `getServerNowMs()`.
 */
export async function calibrateDbClockOffset(
    queryNow: () => Promise<Date | null> = async () => {
        if (typeof prisma.$queryRaw !== "function") {
            return null;
        }
        const rows = await prisma.$queryRaw<{ now: Date }[]>`
            SELECT NOW() AS now
        `;
        return Array.isArray(rows) && rows[0]?.now instanceof Date
            ? rows[0].now
            : null;
    },
    getPerfNow: () => number = () => performance.now(),
): Promise<number> {
    try {
        const perfStart = getPerfNow();
        const dbNow = await queryNow();
        const perfEnd = getPerfNow();

        if (
            !(dbNow instanceof Date) ||
            Number.isNaN(dbNow.getTime()) ||
            !Number.isFinite(perfStart) ||
            !Number.isFinite(perfEnd) ||
            perfEnd < perfStart
        ) {
            return anchorServerEpochMs;
        }

        const midpointPerfMs = perfStart + (perfEnd - perfStart) / 2;
        anchorServerEpochMs = dbNow.getTime() - midpointPerfMs;
        isCalibrated = true;
        return anchorServerEpochMs;
    } catch {
        return anchorServerEpochMs;
    }
}

export function resetServerClockOffset(): void {
    isCalibrated = false;
    anchorServerEpochMs = 0;
}
