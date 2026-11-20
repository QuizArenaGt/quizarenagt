
import path from "node:path";
import { createServer } from "node:http";
import dotenv from "dotenv";

const rootEnvPath = path.resolve(process.cwd(), "../.env");

dotenv.config({ path: rootEnvPath });
dotenv.config();

async function start(): Promise<void> {
    const [
        { app },
        { prisma },
        { createSocketServer },
        { RoundExpirationWorker },
    ] = await Promise.all([
        import("./app.js"),
        import("./database/prisma.js"),
        import("./realtime/socket.server.js"),
        import("./rounds/round-expiration.worker.js"),
    ]);

    const port = Number(process.env.PORT ?? 3000);

    try {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;

        console.log("Conexão com o PostgreSQL estabelecida com sucesso!");

        const httpServer = createServer(app);
        const io = createSocketServer(httpServer);
        const roundExpirationWorker = new RoundExpirationWorker();

        httpServer.listen(port, () => {
            console.log(`Servidor rodando em: http://localhost:${port}`);
            console.log("Socket.IO inicializado com sucesso!");
            roundExpirationWorker.start();
            console.log("Worker de expiração de rodadas iniciado com sucesso!");
        });

        const shutdown = async () => {
            await roundExpirationWorker.stop();
            io.close(async () => {
                await prisma.$disconnect();
                process.exit(0);
            });
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
    } catch (error: unknown) {
        console.error("Falha ao iniciar o servidor:", error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

start();
