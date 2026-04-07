import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		passWithNoTests: true,
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/lib/**/*.ts"],
			exclude: ["src/lib/**/*.d1.ts", "src/lib/**/registry.ts"],
		},
		env: {
			AUTH_SECRET: "test-secret-at-least-32-chars-long-ok",
			ISSUER_BASE_URL: "https://auth.test.local",
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});