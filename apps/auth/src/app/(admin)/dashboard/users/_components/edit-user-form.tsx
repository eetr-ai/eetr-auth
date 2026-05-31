import type { FormEvent } from "react";
import { Input } from "@/components/ui";

interface EditUserFormProps {
	username: string;
	onUsernameChange: (value: string) => void;
	name: string;
	onNameChange: (value: string) => void;
	email: string;
	onEmailChange: (value: string) => void;
	password: string;
	onPasswordChange: (value: string) => void;
	isAdmin: boolean;
	onIsAdminChange: (value: boolean) => void;
	onSubmit: (e: FormEvent) => void;
	onCancel: () => void;
}

const compactInput = "px-2 py-1 text-sm";

export function EditUserForm({
	username,
	onUsernameChange,
	name,
	onNameChange,
	email,
	onEmailChange,
	password,
	onPasswordChange,
	isAdmin,
	onIsAdminChange,
	onSubmit,
	onCancel,
}: EditUserFormProps) {
	return (
		<form onSubmit={onSubmit} className="grid gap-2 md:grid-cols-7">
			<Input
				type="text"
				value={username}
				onChange={(e) => onUsernameChange(e.target.value)}
				className={compactInput}
			/>
			<Input
				type="text"
				value={name}
				onChange={(e) => onNameChange(e.target.value)}
				placeholder="Display name"
				className={compactInput}
			/>
			<Input
				type="email"
				value={email}
				onChange={(e) => onEmailChange(e.target.value)}
				placeholder="Email"
				className={compactInput}
			/>
			<Input
				type="password"
				value={password}
				onChange={(e) => onPasswordChange(e.target.value)}
				placeholder="New password (optional)"
				className={compactInput}
			/>
			<label className="flex items-center gap-2 rounded-xl border border-brand-muted px-2 py-1 text-sm">
				<input
					type="checkbox"
					checked={isAdmin}
					onChange={(e) => onIsAdminChange(e.target.checked)}
				/>
				Is admin
			</label>
			<button
				type="submit"
				className="rounded-full border border-brand-muted px-2 py-1 text-sm hover:bg-brand-muted/30"
			>
				Save
			</button>
			<button
				type="button"
				onClick={onCancel}
				className="rounded-full border border-brand-muted px-2 py-1 text-sm hover:bg-brand-muted/30"
			>
				Cancel
			</button>
		</form>
	);
}
