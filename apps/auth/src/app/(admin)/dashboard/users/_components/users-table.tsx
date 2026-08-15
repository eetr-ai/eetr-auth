import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { IconButton, InlineDeleteConfirm, TBody, THead, Table, Td, Th } from "@/components/ui";
import type { UserRecord } from "@/lib/repositories/admin.repository";
import type { Environment } from "@/lib/repositories/environment.repository";
import { UserAvatar } from "./user-avatar";
import { VerificationStatus } from "./verification-status";

interface UsersTableProps {
	users: UserRecord[];
	environments: Environment[];
	resettingVerificationUserId: string | null;
	onResetVerification: (user: UserRecord) => void;
	onStartEdit: (user: UserRecord) => void;
	confirmingDeleteUserId: string | null;
	deletingUserId: string | null;
	onRequestDelete: (user: UserRecord) => void;
	onConfirmDelete: (user: UserRecord) => void;
	onCancelDelete: () => void;
}

export function UsersTable({
	users,
	environments,
	resettingVerificationUserId,
	onResetVerification,
	onStartEdit,
	confirmingDeleteUserId,
	deletingUserId,
	onRequestDelete,
	onConfirmDelete,
	onCancelDelete,
}: UsersTableProps) {
	const envById = new Map(environments.map((env) => [env.id, env.name]));

	return (
		<Table minWidth="min-w-[760px]">
			<THead>
				<Th>User</Th>
				<Th>Email</Th>
				<Th>Role</Th>
				<Th>Environments</Th>
				<Th className="text-right">Actions</Th>
			</THead>
			<TBody>
				{users.map((user) => {
					const label = user.name ?? user.username;
					const envNames = (user.environmentIds ?? [])
						.map((id) => envById.get(id))
						.filter((name): name is string => !!name)
						.sort((a, b) => a.localeCompare(b));

					return (
						// Row click is a convenience for pointer users. The pencil stays as the
						// keyboard-reachable, screen-reader-labelled way to do the same thing —
						// a <tr> cannot carry button semantics cleanly.
						<tr
							key={user.id}
							onClick={() => onStartEdit(user)}
							className="cursor-pointer transition-colors hover:bg-surface-hover"
						>
							<Td>
								<div className="flex items-center gap-3">
									<UserAvatar user={user} />
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="truncate font-medium">{label}</span>
											<VerificationStatus user={user} hideWhenNoEmail />
										</div>
										<div className="truncate text-xs text-muted-foreground">@{user.username}</div>
									</div>
								</div>
							</Td>
							<Td className={user.email?.trim() ? undefined : "text-muted-foreground"}>
								{/* block + max-width: `truncate` does nothing on an inline span, so
								    a long address would widen the column instead of ellipsing. */}
								<span className="block max-w-[22rem] truncate">
									{user.email?.trim() ? user.email : "No email"}
								</span>
							</Td>
							<Td className="text-muted-foreground">{user.isAdmin ? "Admin" : "User"}</Td>
							<Td>
								{envNames.length === 0 ? (
									<span className="text-xs text-muted-foreground">None</span>
								) : (
									<div className="flex flex-wrap gap-1">
										{envNames.map((name) => (
											<span
												key={name}
												className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground"
											>
												{name}
											</span>
										))}
									</div>
								)}
							</Td>
							{/* Actions own their clicks, so hitting one never also opens the panel. */}
							<Td onClick={(event) => event.stopPropagation()}>
								<div className="flex items-center justify-end gap-1">
									{confirmingDeleteUserId === user.id ? (
										<InlineDeleteConfirm
											label={`Delete ${label}?`}
											busy={deletingUserId === user.id}
											onConfirm={() => onConfirmDelete(user)}
											onCancel={onCancelDelete}
										/>
									) : (
										<>
											{user.email?.trim() && user.emailVerifiedAt ? (
												<IconButton
													type="button"
													aria-label={`Require ${label} to re-verify their email`}
													title="Require re-verification"
													loading={resettingVerificationUserId === user.id}
													onClick={() => onResetVerification(user)}
												>
													<RotateCcw className="h-4 w-4" />
												</IconButton>
											) : null}
											<IconButton
												type="button"
												aria-label={`Edit ${label}`}
												title="Edit"
												onClick={() => onStartEdit(user)}
											>
												<Pencil className="h-4 w-4" />
											</IconButton>
											<IconButton
												type="button"
												variant="danger"
												aria-label={`Delete ${label}`}
												title="Delete"
												onClick={() => onRequestDelete(user)}
											>
												<Trash2 className="h-4 w-4" />
											</IconButton>
										</>
									)}
								</div>
							</Td>
						</tr>
					);
				})}
			</TBody>
		</Table>
	);
}
