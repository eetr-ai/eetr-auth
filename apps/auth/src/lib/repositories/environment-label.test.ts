import { describe, expect, it } from "vitest";

import { environmentLabel } from "@/lib/repositories/environment.repository";

describe("environmentLabel", () => {
	it("uses the display name when one is set", () => {
		expect(environmentLabel({ name: "prod-eu-1", displayName: "Production (EU)" })).toBe(
			"Production (EU)"
		);
	});

	it("falls back to the name when no display name is set", () => {
		expect(environmentLabel({ name: "prod-eu-1", displayName: null })).toBe("prod-eu-1");
	});

	it("falls back to the name when the display name is only whitespace", () => {
		// Guards the fallback against a row that predates trimming, or a blank written
		// directly to the database, rendering as an empty label.
		expect(environmentLabel({ name: "prod-eu-1", displayName: "   " })).toBe("prod-eu-1");
	});

	it("trims a padded display name rather than rendering the padding", () => {
		expect(environmentLabel({ name: "prod", displayName: "  Production  " })).toBe("Production");
	});
});
