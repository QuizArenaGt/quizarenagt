import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface RateLimiterOptions {
    windowMs: number;
    maxRequests: number;
    message: string;
    keyGenerator?: (req: Request) => string;
    maxEntries?: number;
}

interface RateLimitBucket {
    count: number;
    resetAt: number;
}

export interface RateLimiterInstance {
    middleware: RequestHandler;
    reset: () => void;
    size: () => number;
}

function defaultKeyGenerator(req: Request): string {
    return req.ip || req.socket?.remoteAddress || "unknown";
}

export function createRateLimiter(
    options: RateLimiterOptions,
): RateLimiterInstance {
    const buckets = new Map<string, RateLimitBucket>();
    const maxEntries = options.maxEntries ?? 10_000;
    const resolveKey = options.keyGenerator ?? defaultKeyGenerator;

    function pruneExpired(now: number): void {
        for (const [key, entry] of buckets.entries()) {
            if (entry.resetAt <= now) {
                buckets.delete(key);
            }
        }
    }

    const middleware: RequestHandler = (
        req: Request,
        res: Response,
        next: NextFunction,
    ) => {
        const now = Date.now();
        if (buckets.size >= maxEntries) {
            pruneExpired(now);
            if (buckets.size >= maxEntries) {
                const oldestKey = buckets.keys().next().value;
                if (oldestKey !== undefined) {
                    buckets.delete(oldestKey);
                }
            }
        }

        const key = resolveKey(req);
        const existing = buckets.get(key);

        if (!existing || existing.resetAt <= now) {
            buckets.set(key, {
                count: 1,
                resetAt: now + options.windowMs,
            });
            next();
            return;
        }

        if (existing.count >= options.maxRequests) {
            const retryAfterSeconds = Math.max(
                1,
                Math.ceil((existing.resetAt - now) / 1000),
            );
            res.setHeader("Retry-After", String(retryAfterSeconds));
            res.status(429).json({
                message: options.message,
            });
            return;
        }

        existing.count += 1;
        next();
    };

    return {
        middleware,
        reset: () => {
            buckets.clear();
        },
        size: () => buckets.size,
    };
}

export const recoverPasswordIpLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 15,
    message:
        "Muitas solicitações de recuperação de senha. Aguarde alguns minutos antes de tentar novamente.",
});

export const recoverPasswordEmailLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message:
        "Muitas solicitações para este e-mail. Aguarde alguns minutos antes de tentar novamente.",
    keyGenerator: (req: Request) => {
        const ip = defaultKeyGenerator(req);
        const rawEmail =
            typeof req.body === "object" &&
            req.body !== null &&
            "email" in req.body &&
            typeof (req.body as { email?: unknown }).email === "string"
                ? (req.body as { email: string }).email.trim().toLowerCase()
                : "";
        return rawEmail ? `${ip}:${rawEmail}` : `${ip}:__no_email__`;
    },
});

export const resetPasswordLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
    message:
        "Muitas tentativas de redefinição de senha. Aguarde alguns minutos antes de tentar novamente.",
});

export const changePasswordLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
    message:
        "Muitas tentativas de alteração de senha. Aguarde alguns minutos antes de tentar novamente.",
    keyGenerator: (req: Request) => {
        const ip = defaultKeyGenerator(req);
        return req.user?.id ? `${ip}:${req.user.id}` : ip;
    },
});

export function resetAuthRateLimiters(): void {
    recoverPasswordIpLimiter.reset();
    recoverPasswordEmailLimiter.reset();
    resetPasswordLimiter.reset();
    changePasswordLimiter.reset();
}
