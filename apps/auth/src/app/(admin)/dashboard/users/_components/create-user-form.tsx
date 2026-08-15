import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { Banner, Button, Input, SectionCard } from "@/components/ui";

interface CreateUserFormProps {
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
	error: string | null;
	onSubmit: (e: FormEvent) => void;
}

export function CreateUserForm({
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
	error,
	onSubmit,
}: CreateUserFormProps) {
	return (
		<SectionCard title="Create user" icon={Plus}>
			<Banner variant="error" message={error} />
			<form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-6">
				<Input
					type="text"
					value={username}
					onChange={(e) => onUsernameChange(e.target.value)}
					placeholder="Username"
				/>
				<Input
					type="text"
					value={name}
					onChange={(e) => onNameChange(e.target.value)}
					placeholder="Display name (optional)"
				/>
				<Input
					type="email"
					value={email}
					onChange={(e) => onEmailChange(e.target.value)}
					placeholder="Email (optional)"
				/>
				<Input
					type="password"
					value={password}
					onChange={(e) => onPasswordChange(e.target.value)}
					placeholder="Password"
				/>
				<label className="flex items-center gap-2 rounded-card border border-border px-3 py-2 text-sm">
					<input
						type="checkbox"
						checked={isAdmin}
						onChange={(e) => onIsAdminChange(e.target.checked)}
					/>
					Is admin
				</label>
				<Button type="submit" icon={Plus} className="justify-center">
					Create
				</Button>
			</form>
		</SectionCard>
	);
}
