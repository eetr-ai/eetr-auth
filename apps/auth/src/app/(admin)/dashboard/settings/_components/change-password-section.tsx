import type { FormEvent } from "react";
import { Lock } from "lucide-react";
import { Banner, Button, FormField, Input, SectionCard } from "@/components/ui";

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
}: ChangePasswordSectionProps) {
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
				<Button type="submit" disabled={pending}>
					{pending ? "Changing…" : "Change password"}
				</Button>
			</form>
		</SectionCard>
	);
}
