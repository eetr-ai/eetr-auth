import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	// Build output and generated files — `next lint` excluded these by default;
	// the flat config does not, so ignore them explicitly.
	globalIgnores([
		".next/**",
		".open-next/**",
		"coverage/**",
		"next-env.d.ts",
		"cloudflare-env.d.ts",
	]),
]);

export default eslintConfig;
