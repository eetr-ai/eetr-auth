import type { ReducerAction } from "@eetr/react-reducer-utils";
import { Globe2, KeyRound, Layers, Lock, Tag, type LucideIcon } from "lucide-react";
import { SetupPageActionType, type SetupTabId } from "./state";

const tabs: { id: SetupTabId; label: string; icon: LucideIcon }[] = [
	{ id: "site", label: "Site identity", icon: Globe2 },
	{ id: "admin-api", label: "Admin API", icon: KeyRound },
	{ id: "environments", label: "Environments", icon: Layers },
	{ id: "scopes", label: "Scopes", icon: Tag },
	{ id: "password-policies", label: "Password policies", icon: Lock },
];

interface SetupTabsProps {
	activeTab: SetupTabId;
	dispatch: (action: ReducerAction<SetupPageActionType>) => void;
}

export function SetupTabs({ activeTab, dispatch }: SetupTabsProps) {
	return (
		<div
			className="mt-8 flex flex-wrap gap-1 border-b border-border"
			role="tablist"
			aria-label="Setup sections"
		>
			{tabs.map(({ id, label, icon: Icon }) => {
				const selected = activeTab === id;
				return (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={selected}
						id={`setup-tab-${id}`}
						onClick={() =>
							dispatch({ type: SetupPageActionType.SET_ACTIVE_TAB, data: id })
						}
						className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
							selected
								? "border-brand text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<Icon className="h-4 w-4 shrink-0" />
						{label}
					</button>
				);
			})}
		</div>
	);
}
