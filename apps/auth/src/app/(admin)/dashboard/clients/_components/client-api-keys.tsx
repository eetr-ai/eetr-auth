import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
	Banner,
	Button,
	EmptyState,
	FormField,
	IconButton,
	InlineDeleteConfirm,
	Input,
	Select,
	Spinner,
	Table,
	TBody,
	Td,
	Th,
	THead,
} from "@/components/ui";
import {
	createClientApiKey,
	listClientApiKeys,
	revokeClientApiKey,
} from "@/app/actions/api-key-actions";
import { listUsers } from "@/app/actions/user-actions";
import type { ApiKey } from "@/lib/repositories/api-key.repository";
import type { Scope } from "@/lib/repositories/scope.repository";

interface ClientApiKeysProps {
	/** Client row id. Null while creating, when there is nothing to list yet. */
	clientId: string | null;
	/** All scopes, filtered to this client's grants via `grantedScopeIds`. */
	scopes: Scope[];
	/** The scope ids currently granted to this client. */
	grantedScopeIds: string[];
}

interface UserOption {
	id: string;
	username: string;
}

type KeyStatus = { label: string; className: string };

function statusOf(apiKey: ApiKey, nowIso: string): KeyStatus {
	if (apiKey.revokedAt) {
		return { label: "Revoked", className: "text-destructive" };
	}
	if (apiKey.expiresAt && apiKey.expiresAt <= nowIso) {
		return { label: "Expired", className: "text-muted-foreground" };
	}
	return { label: "Active", className: "text-foreground" };
}

/** Callers spell out the empty case ("never"), so this only formats real timestamps. */
function formatDate(value: string): string {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

/**
 * A client's long-lived API keys, inside the edit panel.
 *
 * Sub-resource actions here are immediate, not form fields: creating or revoking a key
 * takes effect on click and is not part of the client's save. That matches how issued
 * tokens and user consents behave in their panels.
 */
export function ClientApiKeys({ clientId, scopes, grantedScopeIds }: ClientApiKeysProps) {
	const [apiKeys, setApiKeys] = useState<ApiKey[] | null>(null);
	const [users, setUsers] = useState<UserOption[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [busy, setBusy] = useState(false);
	const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);
	const [revokingId, setRevokingId] = useState<string | null>(null);

	// The full credential, shown once after creation.
	const [revealed, setRevealed] = useState<{ keyId: string; apiKey: string } | null>(null);
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState<string | null>(null);

	const [userId, setUserId] = useState("");
	const [name, setName] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const [scopeNames, setScopeNames] = useState<string[]>([]);

	const grantedScopes = scopes.filter((scope) => grantedScopeIds.includes(scope.id));

	// `clientId` is read through a ref inside the guard so a refresh started for one client
	// cannot land after the panel has switched to another.
	const activeClientId = useRef(clientId);
	activeClientId.current = clientId;

	const reload = useCallback(async (id: string) => {
		const items = await listClientApiKeys(id);
		if (activeClientId.current === id) setApiKeys(items);
	}, []);

	useEffect(() => {
		if (!clientId) return;
		let cancelled = false;
		setApiKeys(null);
		setError(null);
		setRevealed(null);
		setCreating(false);
		setConfirmingRevokeId(null);
		Promise.all([listClientApiKeys(clientId), listUsers()])
			.then(([items, userList]) => {
				// The panel can be reopened on another client before this resolves; without
				// the guard the previous client's keys would land.
				if (cancelled) return;
				setApiKeys(items);
				setUsers(userList.map((user) => ({ id: user.id, username: user.username })));
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load API keys");
				}
			});
		return () => {
			cancelled = true;
		};
	}, [clientId]);

	const resetForm = () => {
		setUserId("");
		setName("");
		setExpiresAt("");
		setScopeNames([]);
	};

	const handleCreate = async () => {
		if (!clientId || !userId) return;
		setError(null);
		setBusy(true);
		try {
			const result = await createClientApiKey({
				clientRowId: clientId,
				userId,
				name: name.trim() || null,
				// <input type="date"> gives a bare date; widen it to end-of-day UTC so a key
				// dated today stays usable for the whole day.
				expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null,
				scopeNames: scopeNames.length > 0 ? scopeNames : undefined,
			});
			setRevealed({ keyId: result.apiKey.keyId, apiKey: result.presentedKey });
			setCreating(false);
			resetForm();
			await reload(clientId);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create the API key");
		} finally {
			setBusy(false);
		}
	};

	const handleRevoke = async (id: string) => {
		if (!clientId) return;
		setError(null);
		setRevokingId(id);
		try {
			await revokeClientApiKey(id);
			setConfirmingRevokeId(null);
			await reload(clientId);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to revoke the API key");
		} finally {
			setRevokingId(null);
		}
	};

	const copy = async (value: string) => {
		// The clipboard API rejects on an insecure origin or a denied permission. Failing
		// silently here is worse than usual: the admin would move on believing they had
		// copied a credential that cannot be shown again.
		try {
			await navigator.clipboard.writeText(value);
			setCopyError(null);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
			setCopyError("Could not copy to the clipboard — select the value and copy it manually.");
		}
	};

	if (!clientId) return null;

	const nowIso = new Date().toISOString();

	return (
		<section className="mt-8 border-t border-border pt-6">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h3 className="flex items-center gap-2 text-sm font-medium">
					<KeyRound className="h-4 w-4" />
					API keys
					{apiKeys ? (
						<span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground">
							{apiKeys.length}
						</span>
					) : null}
				</h3>
				{!creating && !revealed ? (
					<Button type="button" variant="secondary" icon={Plus} onClick={() => setCreating(true)}>
						New key
					</Button>
				) : null}
			</div>

			<p className="mb-3 text-xs text-muted-foreground">
				A long-lived credential a machine caller exchanges for an access token, so a CI job
				need not ship this client&apos;s secret. Each key is bound to a user, who becomes the
				token&apos;s subject.
			</p>

			<Banner variant="error" message={error} />

			{revealed ? (
				<div className="space-y-3 rounded-md border border-border p-4">
					<Banner
						variant="warning"
						message={
							<span className="flex items-center gap-2">
								<TriangleAlert className="h-4 w-4 shrink-0" />
								Copy this key now — it is never shown again.
							</span>
						}
					/>
					<div className="flex items-center gap-2">
						<code className="flex-1 break-all rounded bg-surface-sunken px-2 py-1 font-mono text-xs">
							{revealed.apiKey}
						</code>
						<Button
							type="button"
							variant="secondary"
							icon={copied ? Check : Copy}
							onClick={() => copy(revealed.apiKey)}
						>
							{copied ? "Copied" : "Copy"}
						</Button>
					</div>
					<Banner variant="error" message={copyError} />
					<Button type="button" onClick={() => setRevealed(null)}>
						Done
					</Button>
				</div>
			) : null}

			{creating ? (
				<div className="mb-4 space-y-3 rounded-md border border-border p-4">
					<FormField label="User" htmlFor="api-key-user">
						<Select
							id="api-key-user"
							value={userId}
							onChange={(event) => setUserId(event.target.value)}
						>
							<option value="">Select a user…</option>
							{users.map((user) => (
								<option key={user.id} value={user.id}>
									{user.username}
								</option>
							))}
						</Select>
					</FormField>

					<FormField label="Name" htmlFor="api-key-name">
						<Input
							id="api-key-name"
							value={name}
							placeholder="e.g. deploy pipeline"
							onChange={(event) => setName(event.target.value)}
						/>
					</FormField>

					<FormField label="Expires" htmlFor="api-key-expires">
						<Input
							id="api-key-expires"
							type="date"
							value={expiresAt}
							onChange={(event) => setExpiresAt(event.target.value)}
						/>
					</FormField>
					<p className="-mt-2 text-xs text-muted-foreground">
						Leave blank for a key that never expires.
					</p>

					{grantedScopes.length > 0 ? (
						<fieldset>
							<legend className="mb-1 text-sm font-medium">Scopes</legend>
							<p className="mb-2 text-xs text-muted-foreground">
								Select none to grant every scope this client currently holds. The selection is
								a snapshot — the key will not pick up scopes granted to the client later.
							</p>
							<div className="space-y-1">
								{grantedScopes.map((scope) => (
									<label key={scope.id} className="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={scopeNames.includes(scope.scopeName)}
											onChange={(event) =>
												setScopeNames((prev) =>
													event.target.checked
														? [...prev, scope.scopeName]
														: prev.filter((s) => s !== scope.scopeName)
												)
											}
										/>
										{scope.scopeName}
									</label>
								))}
							</div>
						</fieldset>
					) : (
						<p className="text-xs text-muted-foreground">
							This client has no scopes granted, so its keys will mint tokens with none.
						</p>
					)}

					<div className="flex gap-2">
						<Button type="button" onClick={handleCreate} loading={busy} disabled={!userId}>
							Create key
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								setCreating(false);
								resetForm();
							}}
							disabled={busy}
						>
							Cancel
						</Button>
					</div>
				</div>
			) : null}

			{apiKeys === null ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Spinner />
					Loading API keys…
				</div>
			) : apiKeys.length === 0 ? (
				<EmptyState
					icon={KeyRound}
					title="No API keys yet"
					description="Issue one to let a CI job or script get tokens without this client's secret."
				/>
			) : (
				<Table minWidth="min-w-0">
					{/* THead supplies the header <tr> itself — adding one here nests <tr> and
					    the browser reparses it, mangling every column. */}
					{/* THead supplies the header <tr> itself. Seven columns wrapped their own
					    headers in a side panel, so the key id rides under the name and the two
					    timestamps share a Lifetime cell -- the same reduction TokensTable makes. */}
					<THead>
						<Th>Key</Th>
						<Th>User</Th>
						<Th>Lifetime</Th>
						<Th>Status</Th>
						<Th className="text-right">Actions</Th>
					</THead>
					<TBody>
						{apiKeys.map((apiKey) => {
							const status = statusOf(apiKey, nowIso);
							return (
								<tr key={apiKey.id}>
									<Td>
										<div>{apiKey.name ?? "Unnamed key"}</div>
										<code className="font-mono text-xs text-muted-foreground">
											{apiKey.keyId}
										</code>
									</Td>
									<Td>{apiKey.userDisplay}</Td>
									<Td className="text-xs text-muted-foreground">
										<div>
											Expires {apiKey.expiresAt ? formatDate(apiKey.expiresAt) : "never"}
										</div>
										<div>
											Last used{" "}
											{apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "never"}
										</div>
									</Td>
									<Td className={status.className}>{status.label}</Td>
									<Td className="text-right">
										{apiKey.revokedAt ? null : confirmingRevokeId === apiKey.id ? (
											<InlineDeleteConfirm
												label="Revoke this key?"
												confirmLabel="Revoke"
												busy={revokingId === apiKey.id}
												onConfirm={() => handleRevoke(apiKey.id)}
												onCancel={() => setConfirmingRevokeId(null)}
											/>
										) : (
											<IconButton
												type="button"
												variant="danger"
												aria-label={`Revoke API key ${apiKey.name ?? apiKey.keyId}`}
												title="Revoke key"
												disabled={revokingId !== null}
												onClick={() => setConfirmingRevokeId(apiKey.id)}
											>
												<Trash2 className="h-4 w-4" />
											</IconButton>
										)}
									</Td>
								</tr>
							);
						})}
					</TBody>
				</Table>
			)}
		</section>
	);
}
