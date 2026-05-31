"use client";

import { useEffect, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { Button, FullPageSpinner } from "@/components/ui";
import { listClients, createClient } from "@/app/actions/client-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import { listScopes } from "@/app/actions/scope-actions";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";
import type { Client } from "@/lib/repositories/client.repository";
import { CreatedSecretPanel } from "./_components/created-secret-panel";
import { CreateClientForm } from "./_components/create-client-form";
import { ClientsTable } from "./_components/clients-table";

export default function ClientsPage() {
	const [clients, setClients] = useState<Client[]>([]);
	const [environments, setEnvironments] = useState<Environment[]>([]);
	const [scopes, setScopes] = useState<Scope[]>([]);
	const [loading, setLoading] = useState(true);
	const [envFilter, setEnvFilter] = useState<string>("");
	const [showCreate, setShowCreate] = useState(false);
	const [createName, setCreateName] = useState("");
	const [createEnvId, setCreateEnvId] = useState("");
	const [redirectUris, setRedirectUris] = useState<string[]>([""]);
	const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);
	const [expiresAt, setExpiresAt] = useState("");
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [createdSecret, setCreatedSecret] = useState<{
		clientId: string;
		clientSecret: string;
	} | null>(null);
	const [copied, setCopied] = useState<"id" | "secret" | null>(null);

	const load = async () => {
		setLoading(true);
		try {
			const [clientsList, envs, scopesList] = await Promise.all([
				listClients(envFilter || undefined),
				listEnvironments(),
				listScopes(),
			]);
			setClients(clientsList);
			setEnvironments(envs);
			setScopes(scopesList);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, [envFilter]);

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (!createEnvId.trim()) {
			setCreateError("Select an environment");
			return;
		}
		setCreating(true);
		try {
			const result = await createClient({
				environmentId: createEnvId,
				name: createName.trim() || undefined,
				redirectUris: redirectUris.filter((u) => u?.trim()),
				scopeIds: selectedScopeIds.length > 0 ? selectedScopeIds : undefined,
				expiresAt: expiresAt.trim() || undefined,
			});
			setCreatedSecret({
				clientId: result.client.clientId,
				clientSecret: result.clientSecret,
			});
			setShowCreate(false);
			setCreateName("");
			setCreateEnvId("");
			setRedirectUris([""]);
			setSelectedScopeIds([]);
			setExpiresAt("");
			await load();
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : "Failed to create client");
		} finally {
			setCreating(false);
		}
	};

	const copyToClipboard = async (text: string, which: "id" | "secret") => {
		await navigator.clipboard.writeText(text);
		setCopied(which);
		setTimeout(() => setCopied(null), 2000);
	};

	const addRedirectUri = () => setRedirectUris((prev) => [...prev, ""]);
	const setRedirectUriAt = (i: number, v: string) => {
		setRedirectUris((prev) => {
			const next = [...prev];
			next[i] = v;
			return next;
		});
	};
	const removeRedirectUri = (i: number) => {
		setRedirectUris((prev) => prev.filter((_, j) => j !== i));
	};

	const toggleScope = (scopeId: string) => {
		setSelectedScopeIds((prev) =>
			prev.includes(scopeId) ? prev.filter((id) => id !== scopeId) : [...prev, scopeId]
		);
	};

	if (loading && clients.length === 0) {
		return <FullPageSpinner />;
	}

	return (
		<main className="min-h-screen p-6 bg-background text-foreground">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-xl font-semibold">
					<KeyRound className="h-6 w-6" />
					Clients
				</div>
				<Button type="button" icon={Plus} onClick={() => setShowCreate((v) => !v)}>
					Create client
				</Button>
			</div>

			{createdSecret && (
				<CreatedSecretPanel
					clientId={createdSecret.clientId}
					clientSecret={createdSecret.clientSecret}
					copied={copied}
					onCopy={copyToClipboard}
					onDismiss={() => setCreatedSecret(null)}
				/>
			)}

			{showCreate && (
				<CreateClientForm
					environments={environments}
					scopes={scopes}
					createName={createName}
					onCreateNameChange={setCreateName}
					createEnvId={createEnvId}
					onCreateEnvIdChange={setCreateEnvId}
					redirectUris={redirectUris}
					onAddRedirectUri={addRedirectUri}
					onRedirectUriChange={setRedirectUriAt}
					onRemoveRedirectUri={removeRedirectUri}
					selectedScopeIds={selectedScopeIds}
					onToggleScope={toggleScope}
					expiresAt={expiresAt}
					onExpiresAtChange={setExpiresAt}
					creating={creating}
					error={createError}
					onSubmit={handleCreate}
					onCancel={() => setShowCreate(false)}
				/>
			)}

			<ClientsTable
				clients={clients}
				environments={environments}
				envFilter={envFilter}
				onEnvFilterChange={setEnvFilter}
				onClientDeleted={load}
			/>
		</main>
	);
}
