import {
    disconnectPlayerSockets,
    emitRoomEvent,
    getPlayerPresenceRegistry,
} from "../realtime/room-events.js";
import { RoundService } from "../rounds/round.service.js";
import { PlayerAbandonmentRepository } from "./player-abandonment.repository.js";

type AbandonmentRepositoryContract = Pick<
    PlayerAbandonmentRepository,
    "findExpiredCandidateIds" | "abandonExpiredPlayer"
>;

type RoundAutoCloseContract = Pick<RoundService, "tryCloseRoundIfReady">;

export class PlayerAbandonmentService {
    constructor(
        private readonly repository: AbandonmentRepositoryContract =
            new PlayerAbandonmentRepository(),
        private readonly roundService: RoundAutoCloseContract =
            new RoundService(),
        private readonly emitEvent: (
            roomId: string,
            event: string,
            payload: unknown,
        ) => void = emitRoomEvent,
        private readonly disconnectSockets: (
            roomId: string,
            playerId: string,
        ) => Promise<void> = disconnectPlayerSockets,
        private readonly hasActiveSocket: (playerId: string) => boolean = (
            playerId,
        ) => (getPlayerPresenceRegistry()?.getActiveSocketCount(playerId) ?? 0) > 0,
    ) {}

    async processExpiredAbandonments(): Promise<number> {
        const candidateIds = await this.repository.findExpiredCandidateIds();
        let abandonedCount = 0;

        for (const playerId of candidateIds) {
            const result = await this.repository.abandonExpiredPlayer(
                playerId,
                this.hasActiveSocket,
            );

            if (!result.abandoned) {
                continue;
            }

            abandonedCount += 1;

            await this.disconnectSockets(result.roomId, result.player.id);

            this.emitEvent(result.roomId, "player:left", {
                roomId: result.roomId,
                gameId: result.gameId,
                gameStatus: result.gameStatus,
                player: result.player,
                eligiblePlayerCount: result.eligiblePlayerCount,
            });

            if (result.cancelledGame) {
                this.emitEvent(result.roomId, "game:finished", {
                    roomId: result.roomId,
                    gameId: result.cancelledGame.gameId,
                    status: result.cancelledGame.status,
                    reason: result.cancelledGame.reason,
                    finishedAt: result.cancelledGame.finishedAt,
                    ranking: result.cancelledGame.ranking,
                });
            } else if (result.openRoundId) {
                try {
                    await this.roundService.tryCloseRoundIfReady(
                        result.openRoundId,
                    );
                } catch (closeError: unknown) {
                    console.error(
                        "Falha não crítica ao verificar encerramento antecipado da rodada após abandono:",
                        closeError,
                    );
                }
            }
        }

        return abandonedCount;
    }
}
