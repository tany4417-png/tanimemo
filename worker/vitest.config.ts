import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("migrations");
  return {
    plugins: [
      cloudflareTest({
        singleWorker: true,
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            API_TOKEN: "test-token",
            TEST_MIGRATIONS: migrations,
            VAPID_PUBLIC_KEY: "test",
            VAPID_PRIVATE_KEY: "test",
            VAPID_SUBJECT: "mailto:test@example.com",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});
