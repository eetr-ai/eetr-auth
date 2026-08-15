import type { FormEvent } from "react";
import { Input } from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";

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
	environments: Environment[];
	environmentIds: string[];
	onEnvironmentIdsChange: (ids: string[]) => void;
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
	environments,
	environmentIds,
	onEnvironmentIdsChange,
	onSubmit,
	onCancel,
}: EditUserFormProps) {
	const toggleEnvironment = (id: string) => {
		onEnvironmentIdsChange(
			environmentIds.includes(id)
				? environmentIds.filter((envId) => envId !== id)
				: [...environmentIds, id]
		);
	};

	return (
		<form onSubmit={onSubmit} className="space-y-2">
			<div className="grid gap-2 md:grid-cols-7">
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
				<label className="flex items-center gap-2 rounded-card border border-border px-2 py-1 text-sm">
					<input
						type="checkbox"
						checked={isAdmin}
						onChange={(e) => onIsAdminChange(e.target.checked)}
					/>
					Is admin
				</label>
				<button
					type="submit"
					className="rounded-full border border-border px-2 py-1 text-sm hover:bg-surface-hover"
				>
					Save
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="rounded-full border border-border px-2 py-1 text-sm hover:bg-surface-hover"
				>
					Cancel
				</button>
			</div>
			<div className="rounded-card border border-border px-3 py-2">
				<span className="text-xs font-medium text-muted-foreground">Environments</span>
				{environments.length === 0 ? (
					<p className="mt-1 text-xs text-muted-foreground">No environments defined.</p>
				) : (
					<div className="mt-1 flex flex-wrap gap-3">
						{environments.map((env) => (
							<label key={env.id} className="flex cursor-pointer items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={environmentIds.includes(env.id)}
									onChange={() => toggleEnvironment(env.id)}
									className="rounded border-border"
								/>
								<span>{env.name}</span>
							</label>
						))}
					</div>
				)}
			</div>
		</form>
	);
}
