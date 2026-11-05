import path from "node:path";
import dotenv from "dotenv";

const rootEnvPath = path.resolve(process.cwd(), "../.env");

dotenv.config({ path: rootEnvPath });
dotenv.config();

async function start(): Promise<void> {
    const [{ app }, { prisma }] = await Promise.all([
        import("./app.js"),
        import("./database/prisma.js"),
    ]);

    const port = Number(process.env.PORT ?? 3000);

    try {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;

        console.log("Conexão com o PostgreSQL estabelecida com sucesso!");

        const server = app.listen(port, () => {
            console.log(`Servidor rodando em: http://localhost:${port}`);
        });

        const shutdown = async () => {
            server.close(async () => {
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