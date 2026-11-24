import { prisma } from "../database/prisma.js";
import { emitRoomEvent } from "./room-events.js";
import { getServerNowDate } from "./server-clock.js";

export const RECONNECT_GRACE_PERIOD_MS = 60_000;

export type PlayerPresenceState =
    | "ONLINE"
    | "DISCONNECTED"
    | "RECONNECTING";

export type PlayerConnectionIdentity = {
    playerId: string;
    nickname: string;
    gameId: string;
    roomId: string;
};

export interface PlayerPresencePersistence {
    markDisconnected(
        playerId: string,
        disconnectedAt: Date,
        reconnectDeadlineAt: Date,
    ): Promise<boolean>;
    clearDisconnect(playerId: string): Promise<boolean>;
}

export class PrismaPlayerPresencePersistence
    implements PlayerPresencePersistence
{
    async markDisconnected(
        playerId: string,
        disconnectedAt: Date,
        reconnectDeadlineAt: Date,
    ): Promise<boolean> {
        const result = await prisma.gamePlayer.updateMany({
            where: {
                id: playerId,
                status: "ACTIVE",
                game: {
                    status: {
                        in: ["WAITING", "IN_PROGRESS"],
                    },
                },
            },
            data: {
                disconnectedAt,
                reconnectDeadlineAt,
            },
        });

        return result.count > 0;
    }

    async clearDisconnect(playerId: string): Promise<boolean> {
        // Atualização atômica: impede reconexão caso o jogador já tenha virado ABANDONED/LEFT
        // ou o prazo de reconexão tenha expirado antes da conclusão do handshake.
        const now = getServerNowDate();
        const result = await prisma.gamePlayer.updateMany({
            where: {
                id: playerId,
                status: "ACTIVE",
                OR: [
                    { reconnectDeadlineAt: null },
                    { reconnectDeadlineAt: { gt: now } },
                ],
            },
            data: {
                disconnectedAt: null,
                reconnectDeadlineAt: null,
            },
        });

        return result.count > 0;
    }
}

type PlayerPresenceRegistryOptions = {
    persistence?: PlayerPresencePersistence;
    emitEvent?: (roomId: string, event: string, payload: unknown) => void;
    gracePeriodMs?: number;
    now?: () => Date;
};

export class PlayerPresenceRegistry {
    private readonly persistence: PlayerPresencePersistence;
    private readonly emitEvent: (
        roomId: string,
        event: string,
        payload: unknown,
    ) => void;
    private readonly gracePeriodMs: number;
    private readonly now: () => Date;

    private readonly activeSocketsByPlayer = new Map<string, Set<string>>();
    private readonly reconnectingSocketsByPlayer = new Map<
        string,
        Set<string>
    >();
    private readonly connectedOnce = new Set<string>();
    private readonly emittedDisconnected = new Set<string>();
    private readonly suppressedPlayers = new Set<string>();
    private readonly queues = new Map<string, Promise<void>>();

    constructor(options: PlayerPresenceRegistryOptions = {}) {
        this.persistence =
            options.persistence ?? new PrismaPlayerPresencePersistence();
        this.emitEvent = options.emitEvent ?? emitRoomEvent;
        this.gracePeriodMs =
            options.gracePeriodMs ?? RECONNECT_GRACE_PERIOD_MS;
        this.now = options.now ?? (() => getServerNowDate());
    }

    markReconnecting(playerId: string, socketId: string): void {
        let reconnecting = this.reconnectingSocketsByPlayer.get(playerId);
        if (!reconnecting) {
            reconnecting = new Set<string>();
            this.reconnectingSocketsByPlayer.set(playerId, reconnecting);
        }
        reconnecting.add(socketId);
    }

    clearReconnecting(playerId: string, socketId: string): void {
        const reconnecting = this.reconnectingSocketsByPlayer.get(playerId);
        if (!reconnecting) {
            return;
        }
        reconnecting.delete(socketId);
        if (socketId !== "handshake") {
            reconnecting.delete("handshake");
        }
        if (reconnecting.size === 0) {
            this.reconnectingSocketsByPlayer.delete(playerId);
        }
    }

    /**
     * Suprime registro de desconexão inesperada quando o jogador sai voluntariamente.
     */
    suppressPlayer(playerId: string): void {
        this.suppressedPlayers.add(playerId);
        this.reconnectingSocketsByPlayer.delete(playerId);
        this.emittedDisconnected.delete(playerId);
    }

    handleSocketConnected(
        params: PlayerConnectionIdentity & {
            socketId: string;
            wasDisconnectedInDb?: boolean;
            onRejected?: () => void;
        },
    ): void {
        const {
            playerId,
            nickname,
            gameId,
            roomId,
            socketId,
            wasDisconnectedInDb = false,
            onRejected,
        } = params;

        this.clearReconnecting(playerId, socketId);
        this.suppressedPlayers.delete(playerId);

        let sockets = this.activeSocketsByPlayer.get(playerId);
        const hadActiveSocket = (sockets?.size ?? 0) > 0;
        if (!sockets) {
            sockets = new Set<string>();
            this.activeSocketsByPlayer.set(playerId, sockets);
        }

        if (sockets.has(socketId)) {
            return;
        }

        sockets.add(socketId);

        this.enqueue(playerId, async () => {
            if ((this.activeSocketsByPlayer.get(playerId)?.size ?? 0) === 0) {
                return;
            }

            const wasDisconnected =
                this.emittedDisconnected.delete(playerId) ||
                wasDisconnectedInDb;

            if (wasDisconnected) {
                const cleared = await this.persistence.clearDisconnect(playerId);
                if (!cleared) {
                    const currentSockets =
                        this.activeSocketsByPlayer.get(playerId);
                    currentSockets?.delete(socketId);
                    if (currentSockets && currentSockets.size === 0) {
                        this.activeSocketsByPlayer.delete(playerId);
                    }
                    this.connectedOnce.delete(playerId);
                    onRejected?.();
                    return;
                }

                this.connectedOnce.add(playerId);
                this.emitEvent(roomId, "player:reconnected", {
                    roomId,
                    gameId,
                    player: {
                        id: playerId,
                        nickname,
                        status: "ACTIVE",
                    },
                    presence: "ONLINE" satisfies PlayerPresenceState,
                    reconnectedAt: this.now().toISOString(),
                });
                return;
            }

            if (!hadActiveSocket && !this.connectedOnce.has(playerId)) {
                this.connectedOnce.add(playerId);
                this.emitEvent(roomId, "player:connected", {
                    roomId,
                    gameId,
                    player: {
                        id: playerId,
                        nickname,
                        status: "ACTIVE",
                    },
                    presence: "ONLINE" satisfies PlayerPresenceState,
                    connectedAt: this.now().toISOString(),
                });
            }
        });
    }

    handleSocketDisconnected(
        params: PlayerConnectionIdentity & { socketId: string },
    ): void {
        const { playerId, nickname, gameId, roomId, socketId } = params;

        this.clearReconnecting(playerId, socketId);

        const sockets = this.activeSocketsByPlayer.get(playerId);
        const removed = sockets?.delete(socketId) ?? false;
        if (sockets && sockets.size === 0) {
            this.activeSocketsByPlayer.delete(playerId);
        }

        if (!removed) {
            return;
        }

        if ((this.activeSocketsByPlayer.get(playerId)?.size ?? 0) > 0) {
            return;
        }

        if (this.suppressedPlayers.has(playerId)) {
            this.suppressedPlayers.delete(playerId);
            this.connectedOnce.delete(playerId);
            this.emittedDisconnected.delete(playerId);
            return;
        }

        this.enqueue(playerId, async () => {
            // Se outro socket conectou antes da persistência (ex.: F5 rápido), aborta.
            if ((this.activeSocketsByPlayer.get(playerId)?.size ?? 0) > 0) {
                return;
            }

            if (this.suppressedPlayers.delete(playerId)) {
                return;
            }

            const disconnectedAt = this.now();
            const reconnectDeadlineAt = new Date(
                disconnectedAt.getTime() + this.gracePeriodMs,
            );

            const marked = await this.persistence.markDisconnected(
                playerId,
                disconnectedAt,
                reconnectDeadlineAt,
            );

            if (!marked) {
                return;
            }

            // Garante que uma conexão que chegou durante a escrita no banco não seja sobrescrita.
            if ((this.activeSocketsByPlayer.get(playerId)?.size ?? 0) > 0) {
                await this.persistence.clearDisconnect(playerId);
                return;
            }

            this.emittedDisconnected.add(playerId);
            this.emitEvent(roomId, "player:disconnected", {
                roomId,
                gameId,
                player: {
                    id: playerId,
                    nickname,
                    status: "ACTIVE",
                },
                presence: "DISCONNECTED" satisfies PlayerPresenceState,
                disconnectedAt: disconnectedAt.toISOString(),
                reconnectDeadlineAt: reconnectDeadlineAt.toISOString(),
            });
        });
    }

    getActiveSocketCount(playerId: string): number {
        return this.activeSocketsByPlayer.get(playerId)?.size ?? 0;
    }

    getActiveSockets(playerId: string): ReadonlySet<string> {
        return this.activeSocketsByPlayer.get(playerId) ?? new Set<string>();
    }

    /**
     * Deriva presença estritamente dos sockets ativos/em reconexão,
     * nunca marcando ONLINE apenas pelo estado persistido no banco.
     */
    getPlayerPresence(playerId: string): PlayerPresenceState {
        if ((this.activeSocketsByPlayer.get(playerId)?.size ?? 0) > 0) {
            return "ONLINE";
        }

        if ((this.reconnectingSocketsByPlayer.get(playerId)?.size ?? 0) > 0) {
            return "RECONNECTING";
        }

        return "DISCONNECTED";
    }

    async whenIdle(playerId: string): Promise<void> {
        await (this.queues.get(playerId) ?? Promise.resolve());
    }

    private enqueue(playerId: string, task: () => Promise<void>): void {
        const previous = this.queues.get(playerId) ?? Promise.resolve();
        const next = previous
            .catch(() => undefined)
            .then(task)
            .finally(() => {
                if (this.queues.get(playerId) === next) {
                    this.queues.delete(playerId);
                }
            });
        this.queues.set(playerId, next);
    }
}
