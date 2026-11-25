export interface ConnectWithRetryOptions {
    connect: () => Promise<void>;
    ping: () => Promise<void>;
    calibrateClock: () => Promise<unknown>;
    isClockCalibrated: () => boolean;
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (
        attempt: number,
        maxAttempts: number,
        delayMs: number,
        error: unknown,
    ) => void;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 1500;
const DEFAULT_MAX_DELAY_MS = 6000;
const DEFAULT_BACKOFF_FACTOR = 2;

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Executa a conexão inicial e a calibração do relógio com o PostgreSQL
 * utilizando retry limitado e backoff exponencial para tolerar cold starts
 * transitórios (ex.: ativação de compute suspenso no Neon).
 */
export async function connectDatabaseWithRetry(
    options: ConnectWithRetryOptions,
): Promise<void> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    const initialDelayMs = Math.max(
        0,
        options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS,
    );
    const maxDelayMs = Math.max(
        initialDelayMs,
        options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    );
    const backoffFactor = Math.max(
        1,
        options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR,
    );
    const sleep = options.sleep ?? defaultSleep;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            await options.connect();
            await options.ping();
            await options.calibrateClock();

            if (!options.isClockCalibrated()) {
                throw new Error(
                    "Falha ao calibrar o relógio monotônico do servidor com o PostgreSQL.",
                );
            }

            return;
        } catch (error: unknown) {
            lastError = error;

            if (attempt >= maxAttempts) {
                break;
            }

            const delayMs = Math.min(
                maxDelayMs,
                Math.round(initialDelayMs * backoffFactor ** (attempt - 1)),
            );

            options.onRetry?.(attempt, maxAttempts, delayMs, error);
            if (delayMs > 0) {
                await sleep(delayMs);
            }
        }
    }

    throw lastError;
}
