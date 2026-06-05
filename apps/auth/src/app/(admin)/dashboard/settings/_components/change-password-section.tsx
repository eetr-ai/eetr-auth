import type { FormEvent } from "react";
import { Check, Circle, Lock } from "lucide-react";
import { Banner, Button, FormField, Input, SectionCard } from "@/components/ui";
import type { PasswordPolicy } from "@/lib/repositories/password-policy.repository";
import {
	listPolicyRequirements,
	validatePasswordAgainstPolicy,
} from "@/lib/auth/password-policy-validation";

interface ChangePasswordSectionProps {
	currentPassword: string;
	onCurrentPasswordChange: (value: string) => void;
	newPassword: string;
	onNewPasswordChange: (value: string) => void;
	confirmPassword: string;
	onConfirmPasswordChange: (value: string) => void;
	pending: boolean;
	error: string | null;
	success: string | null;
	onSubmit: (e: FormEvent) => void;
	/** Active admin sign-in policy, for live requirement feedback. Null = no policy. */
	policy: PasswordPolicy | null;
	/** Identifiers for the "must not contain username/email" rule. */
	username: string | null;
	email: string | null;
}

export function ChangePasswordSection({
	currentPassword,
	onCurrentPasswordChange,
	newPassword,
	onNewPasswordChange,
	confirmPassword,
	onConfirmPasswordChange,
	pending,
	error,
	success,
	onSubmit,
	policy,
	username,
	email,
}: ChangePasswordSectionProps) {
	const activePolicy = policy && policy.enabled ? policy : null;
	const requirements = activePolicy ? listPolicyRequirements(activePolicy) : [];
	const failedCodes = activePolicy
		? new Set(
				validatePasswordAgainstPolicy(activePolicy, newPassword, { username, email }).violations.map(
					(v) => v.code
				)
			)
		: new Set<string>();
	// Only block submit once something has been typed; an empty field is handled by `required`.
	const policyUnmet = newPassword.length > 0 && failedCodes.size > 0;

	return (
		<SectionCard title="Change password" icon={Lock}>
			<Banner variant="error" message={error} />
			<Banner variant="success" message={success} />
			<form onSubmit={onSubmit} className="space-y-4">
				<FormField label="Current password">
					<Input
						type="password"
						value={currentPassword}
						onChange={(e) => onCurrentPasswordChange(e.target.value)}
						autoComplete="current-password"
						required
					/>
				</FormField>
				<div className="grid gap-4 sm:grid-cols-2">
					<FormField label="New password">
						<Input
							type="password"
							value={newPassword}
							onChange={(e) => onNewPasswordChange(e.target.value)}
							autoComplete="new-password"
							required
						/>
					</FormField>
					<FormField label="Confirm new password">
						<Input
							type="password"
							value={confirmPassword}
							onChange={(e) => onConfirmPasswordChange(e.target.value)}
							autoComplete="new-password"
							required
						/>
					</FormField>
				</div>

				{requirements.length > 0 ? (
					<ul className="space-y-1" aria-label="Password requirements">
						{requirements.map((req) => {
							const met = newPassword.length > 0 && !failedCodes.has(req.code);
							return (
								<li
									key={req.code}
									className={`flex items-center gap-2 text-sm ${met ? "text-foreground" : "text-muted-foreground"}`}
								>
									{met ? (
										<Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
									) : (
										<Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />
									)}
									<span>{req.label}</span>
								</li>
							);
						})}
					</ul>
				) : null}

				<Button type="submit" disabled={pending || policyUnmet}>
					{pending ? "Changing…" : "Change password"}
				</Button>
			</form>
		</SectionCard>
	);
}
