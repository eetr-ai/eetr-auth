import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	// eslint-config-next 16 ships the React Compiler rules from react-hooks 7. Our admin screens
	// still load data with setState inside effects and read refs during render, so we keep these
	// two as warnings until those components are refactored rather than block every lint run.
	{
		rules: {
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/refs": "warn",
		},
	},
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
