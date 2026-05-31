import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const eslintConfig = [
	// Build output and generated files — `next lint` excluded these by default;
	// the flat config does not, so ignore them explicitly.
	{
		ignores: [
			".next/**",
			".open-next/**",
			"coverage/**",
			"next-env.d.ts",
			"cloudflare-env.d.ts",
		],
	},
	...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
