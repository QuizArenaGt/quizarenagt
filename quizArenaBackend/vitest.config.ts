import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
        testTimeout: 15000,
        hookTimeout: 15000,
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov", "html"],
            reportsDirectory: "./coverage",
            include: ["src/**/*.ts"],
            exclude: [
                "src/**/*.d.ts",
                "src/server.ts",
            ],
        },
    },
});