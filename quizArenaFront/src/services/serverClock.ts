export interface ServerTimeSampleInput {
    serverTimeMs: number;
    requestStartedPerfMs: number;
    requestCompletedPerfMs: number;
}

type ServerClockListener = () => void;

const MAX_INITIAL_RTT_MS = 10_000;
const MAX_RECOVERY_RTT_MS = 5_000;
const RTT_TIE_TOLERANCE_MS = 15;
const ANCHOR_REFRESH_AGE_MS = 60_000;
const DRIFT_RECOVERY_THRESHOLD_MS = 500;

let hasSynced = false;
let offsetMs = 0;
let bestRttMs = Number.POSITIVE_INFINITY;
let lastSyncedPerfMs = 0;
let latestAcceptedT0PerfMs = Number.NEGATIVE_INFINITY;

const listeners = new Set<ServerClockListener>();

function defaultGetPerfNow(): number {
    return globalThis.performance.now();
}

function notifyServerClockListeners(): void {
    for (const listener of listeners) {
        listener();
    }
}

export function subscribeServerClock(listener: ServerClockListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function isServerClockSynced(): boolean {
    return hasSynced;
}

/**
 * Retorna o horário estimado atual do servidor em milissegundos usando exclusivamente
 * a âncora sincronizada e `performance.now()` (monotônico).
 * Retorna `null` antes da primeira sincronização confiável, evitando fallback em `Date.now()`.
 */
export function getServerNowMs(
    perfNowMs: number = defaultGetPerfNow(),
): number | null {
    if (!hasSynced || !Number.isFinite(perfNowMs)) {
        return null;
    }

    return offsetMs + perfNowMs;
}

/**
 * Registra uma amostra de tempo do servidor medida com `performance.now()`,
 * compensando a latência pelo ponto médio do round-trip e descartando amostras
 * atrasadas, fora de ordem ou menos confiáveis que a referência atual.
 */
export function recordServerTimeSample(sample: ServerTimeSampleInput): boolean {
    const { serverTimeMs, requestStartedPerfMs, requestCompletedPerfMs } = sample;

    if (
        !Number.isFinite(serverTimeMs) ||
        serverTimeMs <= 0 ||
        !Number.isFinite(requestStartedPerfMs) ||
        !Number.isFinite(requestCompletedPerfMs) ||
        requestCompletedPerfMs < requestStartedPerfMs
    ) {
        return false;
    }

    const rttMs = requestCompletedPerfMs - requestStartedPerfMs;
    const midpointPerfMs = requestStartedPerfMs + rttMs / 2;
    const candidateOffsetMs = serverTimeMs - midpointPerfMs;

    if (!hasSynced) {
        if (rttMs > MAX_INITIAL_RTT_MS) {
            return false;
        }

        hasSynced = true;
        offsetMs = candidateOffsetMs;
        bestRttMs = rttMs;
        lastSyncedPerfMs = midpointPerfMs;
        latestAcceptedT0PerfMs = requestStartedPerfMs;
        notifyServerClockListeners();
        return true;
    }

    // Descarta respostas atrasadas de requisições iniciadas antes da última âncora aceita.
    if (requestStartedPerfMs < latestAcceptedT0PerfMs) {
        return false;
    }

    const predictedServerNowMs = offsetMs + midpointPerfMs;
    const driftMs = Math.abs(serverTimeMs - predictedServerNowMs);
    const expectedErrorBoundMs = (rttMs + bestRttMs) / 2;
    const indicatesClockJumpOrSuspend =
        driftMs > Math.max(DRIFT_RECOVERY_THRESHOLD_MS, expectedErrorBoundMs + 250);

    if (indicatesClockJumpOrSuspend) {
        if (rttMs > MAX_RECOVERY_RTT_MS) {
            return false;
        }

        offsetMs = candidateOffsetMs;
        bestRttMs = rttMs;
        lastSyncedPerfMs = midpointPerfMs;
        latestAcceptedT0PerfMs = requestStartedPerfMs;
        notifyServerClockListeners();
        return true;
    }

    const anchorAgeMs = midpointPerfMs - lastSyncedPerfMs;
    const isBetterOrComparableRtt = rttMs <= bestRttMs + RTT_TIE_TOLERANCE_MS;
    const isRoutineAgeRefresh =
        anchorAgeMs >= ANCHOR_REFRESH_AGE_MS && rttMs <= Math.max(bestRttMs * 2, 250);

    if (!isBetterOrComparableRtt && !isRoutineAgeRefresh) {
        return false;
    }

    offsetMs = candidateOffsetMs;
    bestRttMs = isRoutineAgeRefresh ? rttMs : Math.min(bestRttMs, rttMs);
    lastSyncedPerfMs = midpointPerfMs;
    latestAcceptedT0PerfMs = requestStartedPerfMs;
    notifyServerClockListeners();
    return true;
}

export function resetServerClock(): void {
    hasSynced = false;
    offsetMs = 0;
    bestRttMs = Number.POSITIVE_INFINITY;
    lastSyncedPerfMs = 0;
    latestAcceptedT0PerfMs = Number.NEGATIVE_INFINITY;
}

export function getServerClockSnapshot() {
    return {
        hasSynced,
        offsetMs,
        bestRttMs,
        lastSyncedPerfMs,
        latestAcceptedT0PerfMs,
    };
}
