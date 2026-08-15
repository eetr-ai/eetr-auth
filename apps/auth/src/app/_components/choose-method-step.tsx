import { LogOut, Mail, Smartphone } from "lucide-react";
import { Banner } from "@/components/ui";

interface ChooseMethodStepProps {
	error: string | null;
	pending: boolean;
	onChooseMethod: (method: "totp" | "email") => void;
	onSignOut: () => void;
}

export function ChooseMethodStep({ error, pending, onChooseMethod, onSignOut }: ChooseMethodStepProps) {
	return (
		<div className="space-y-6">
			<Banner variant="info" message="Choose how you'd like to verify this sign-in." />
			<Banner variant="error" message={error} />
			<div className="space-y-3">
				<button
					type="button"
					disabled={pending}
					onClick={() => onChooseMethod("totp")}
					className="flex w-full items-center gap-3 rounded-card border border-border px-4 py-3 text-left hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
				>
					<Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />
					<span className="flex-1">
						<span className="block text-sm font-medium text-foreground">Authenticator app</span>
						<span className="block text-xs text-muted-foreground">Enter the code from your authenticator app.</span>
					</span>
				</button>
				<button
					type="button"
					disabled={pending}
					onClick={() => onChooseMethod("email")}
					className="flex w-full items-center gap-3 rounded-card border border-border px-4 py-3 text-left hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
				>
					<Mail className="h-5 w-5 shrink-0 text-muted-foreground" />
					<span className="flex-1">
						<span className="block text-sm font-medium text-foreground">Email code</span>
						<span className="block text-xs text-muted-foreground">
							{pending ? "Sending…" : "Send a 6-digit code to your email."}
						</span>
					</span>
				</button>
			</div>
			<button
				type="button"
				disabled={pending}
				onClick={onSignOut}
				className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground underline hover:text-foreground"
			>
				<LogOut className="h-4 w-4" />
				Sign out
			</button>
		</div>
	);
}
