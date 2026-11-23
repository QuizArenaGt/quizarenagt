import { PlayerAbandonmentService } from "../rooms/player-abandonment.service.js";
import { RoundService } from "./round.service.js";

type RoundExpirationProcessor = Pick<RoundService, "processExpiredRounds">;
type PlayerAbandonmentProcessor = Pick<
    PlayerAbandonmentService,
    "processExpiredAbandonments"
>;

export class RoundExpirationWorker {
    private timer: ReturnType<typeof setInterval> | null = null;
    private inFlightCycle: Promise<number> | null = null;
    private isStopped = true;
    private lastAbandonmentCheckAt = 0;
    private readonly roundService: RoundExpirationProcessor;
    private readonly abandonmentService: PlayerAbandonmentProcessor | null;

    constructor(
        roundService?: RoundExpirationProcessor,
        private readonly intervalMs = 1000,
        abandonmentService?: PlayerAbandonmentProcessor | null,
        private readonly abandonmentIntervalMs = 5000,
    ) {
        this.roundService = roundService ?? new RoundService();
        this.abandonmentService =
            abandonmentService !== undefined
                ? abandonmentService
                : roundService === undefined
                    ? new PlayerAbandonmentService()
                    : null;
    }

    start(): void {
        if (!this.isStopped) {
            return;
        }

        this.isStopped = false;
        this.lastAbandonmentCheckAt = 0;

        // Varredura imediata no boot para encerrar rodadas e abandonos expirados durante reinicialização.
        void this.runCycle();

        this.timer = setInterval(() => {
            void this.runCycle();
        }, this.intervalMs);
    }

    async stop(): Promise<void> {
        this.isStopped = true;

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        if (this.inFlightCycle) {
            await this.inFlightCycle;
        }
    }

    async runCycle(): Promise<number> {
        if (this.inFlightCycle) {
            return this.inFlightCycle;
        }

        const cycle = (async () => {
            try {
                const closedRounds =
                    await this.roundService.processExpiredRounds();

                if (this.abandonmentService) {
                    const nowMs = Date.now();
                    if (
                        this.lastAbandonmentCheckAt === 0 ||
                        nowMs - this.lastAbandonmentCheckAt >=
                            this.abandonmentIntervalMs
                    ) {
                        this.lastAbandonmentCheckAt = nowMs;
                        await this.abandonmentService.processExpiredAbandonments();
                    }
                }

                return closedRounds;
            } catch (error: unknown) {
                console.error(
                    "Erro ao processar rodadas/abandonos expirados em background:",
                    error,
                );
                return 0;
            } finally {
                this.inFlightCycle = null;
            }
        })();

        this.inFlightCycle = cycle;
        return cycle;
    }

    async runAbandonmentCycle(): Promise<number> {
        if (!this.abandonmentService) {
            return 0;
        }

        this.lastAbandonmentCheckAt = Date.now();
        return this.abandonmentService.processExpiredAbandonments();
    }
}
