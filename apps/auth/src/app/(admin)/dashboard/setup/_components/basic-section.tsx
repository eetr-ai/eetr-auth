import type { ReactNode } from "react";
import type { SetupTabId } from "./state";

interface BasicSectionProps {
	activeTab: SetupTabId;
	environments: ReactNode;
	scopes: ReactNode;
}

/**
 * The "Basic" tab: environments and scopes side by side.
 *
 * Both are short, single-field lists that each used to own a whole tab, which
 * left most of the screen empty. Owning the tabpanel wrapper here also keeps
 * its aria plumbing in one place instead of repeated in each child.
 */
export function BasicSection({ activeTab, environments, scopes }: BasicSectionProps) {
	return (
		<section
			className={`mt-6 grid gap-6 lg:grid-cols-2 ${activeTab !== "basic" ? "hidden" : ""}`}
			role="tabpanel"
			id="setup-panel-basic"
			aria-labelledby="setup-tab-basic"
			aria-hidden={activeTab !== "basic"}
		>
			{environments}
			{scopes}
		</section>
	);
}
