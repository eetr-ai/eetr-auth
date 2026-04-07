import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, "../..");

initOpenNextCloudflareForDev();

const nextConfig = {
	outputFileTracingRoot: workspaceRoot,
	turbopack: {
		root: workspaceRoot,
	},
};

export default nextConfig;