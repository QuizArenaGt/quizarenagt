import { RoundService } from "./round.service.js";

type RoundExpirationProcessor = Pick<RoundService, "processExpiredRounds">;

export class RoundExpirationWorker {
    private timer: ReturnType<typeof setInterval> | null = null;
    private inFlightCycle: Promise<number> | null = null;
    private isStopped = true;

    constructor(
        private readonly roundService: RoundExpirationProcessor =
            new RoundService(),
        private readonly intervalMs = 1000,
    ) {}

    start(): void {
        if (!this.isStopped) {
            return;
        }

        this.isStopped = false;

        // Varredura imediata no boot para encerrar rodadas que expiraram durante reinicialização.
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
                return await this.roundService.processExpiredRounds();
            } catch (error: unknown) {
                console.error(
                    "Erro ao processar rodadas expiradas em background:",
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
}
