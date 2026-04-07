import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, "../..");
const localWranglerConfig = ["wrangler.generated.jsonc", "infra/wrangler.template.jsonc"]
	.map((relativePath) => resolve(__dirname, relativePath))
	.find((candidate) => existsSync(candidate));

initOpenNextCloudflareForDev(localWranglerConfig ? { configPath: localWranglerConfig } : undefined);

const nextConfig = {
	outputFileTracingRoot: workspaceRoot,
	turbopack: {
		root: workspaceRoot,
	},
};

export default nextConfig;