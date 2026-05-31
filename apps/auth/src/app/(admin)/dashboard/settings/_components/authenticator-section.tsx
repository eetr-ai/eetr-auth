import type { FormEvent } from "react";
import { Loader2, Smartphone, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
	Banner,
	Button,
	FormField,
	IconButton,
	InlineDeleteConfirm,
	Input,
	SectionCard,
} from "@/components/ui";
import { formatDate } from "./format";

interface TotpStatus {
	enrolled: boolean;
	createdAt: string | null;
	lastUsedAt: string | null;
}

interface AuthenticatorSectionProps {
	status: TotpStatus | null;
	enroll: { otpauthUri: string; secret: string } | null;
	code: string;
	onCodeChange: (value: string) => void;
	busy: boolean;
	error: string | null;
	success: string | null;
	confirmingRemove: boolean;
	removing: boolean;
	onBegin: () => void;
	onConfirm: (e: FormEvent) => void;
	onCancelEnroll: () => void;
	onRequestRemove: () => void;
	onRemove: () => void;
	onCancelRemove: () => void;
}

export function AuthenticatorSection({
	status,
	enroll,
	code,
	onCodeChange,
	busy,
	error,
	success,
	confirmingRemove,
	removing,
	onBegin,
	onConfirm,
	onCancelEnroll,
	onRequestRemove,
	onRemove,
	onCancelRemove,
}: AuthenticatorSectionProps) {
	return (
		<SectionCard title="Authenticator app" icon={Smartphone}>
			<Banner variant="error" message={error} />
			<Banner variant="success" message={success} />
			<p className="mb-4 text-sm text-muted-foreground">
				Use an authenticator app (like Google Authenticator) for two-factor sign-in codes.
			</p>
			{status === null ? (
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			) : status.enrolled ? (
				<div className="flex items-center gap-3 rounded-xl border border-brand-muted p-3">
					<Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium">Authenticator app</span>
							<span className="shrink-0 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200">
								Enabled
							</span>
						</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Added {formatDate(status.createdAt)} · Last used {formatDate(status.lastUsedAt)}
						</p>
					</div>
					{confirmingRemove ? (
						<InlineDeleteConfirm
							label="Remove?"
							confirmLabel="Remove"
							busy={removing}
							onConfirm={onRemove}
							onCancel={onCancelRemove}
						/>
					) : (
						<IconButton
							variant="danger"
							aria-label="Remove authenticator app"
							onClick={onRequestRemove}
						>
							<Trash2 className="h-4 w-4" />
						</IconButton>
					)}
				</div>
			) : enroll ? (
				<form onSubmit={onConfirm} className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
					</p>
					<div className="flex justify-center">
						<div className="rounded-xl bg-white p-3">
							<QRCodeSVG value={enroll.otpauthUri} size={176} />
						</div>
					</div>
					<div>
						<p className="mb-1 text-xs text-muted-foreground">Can&apos;t scan? Enter this key manually:</p>
						<code className="block break-all rounded-xl border border-brand-muted bg-brand-muted/20 px-3 py-2 text-sm tracking-wider">
							{enroll.secret}
						</code>
					</div>
					<FormField label="Verification code">
						<Input
							type="text"
							inputMode="numeric"
							autoComplete="one-time-code"
							pattern="[0-9]{6}"
							maxLength={6}
							required
							value={code}
							onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
							className="text-center tracking-[0.3em]"
							placeholder="000000"
						/>
					</FormField>
					<div className="flex items-center gap-2">
						<Button type="submit" disabled={busy || code.length !== 6}>
							{busy ? "Verifying…" : "Verify and enable"}
						</Button>
						<Button type="button" variant="secondary" onClick={onCancelEnroll} disabled={busy}>
							Cancel
						</Button>
					</div>
				</form>
			) : (
				<Button
					type="button"
					variant="secondary"
					loading={busy}
					icon={Smartphone}
					onClick={onBegin}
				>
					{busy ? "Preparing…" : "Add authenticator app"}
				</Button>
			)}
		</SectionCard>
	);
}
