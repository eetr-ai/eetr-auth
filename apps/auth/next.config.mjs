import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

initOpenNextCloudflareForDev();

const nextConfig = {
	turbopack: {
		root: __dirname,
	},
};

export default nextConfig;