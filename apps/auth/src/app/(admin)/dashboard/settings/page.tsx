"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";
import {
	UserCircle,
	Lock,
	ImageIcon,
	Upload,
	Fingerprint,
	Loader2,
	Trash2,
	Check,
	X,
	Pencil,
	BadgeCheck,
	Smartphone,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { updateDisplayName, changePassword } from "@/app/actions/user-settings-actions";
// updateUsername is intentionally omitted — username is read-only for users
import { getCurrentUser, getUserById } from "@/app/actions/user-actions";
import {
	getTotpStatus,
	beginTotpEnrollment,
	confirmTotpEnrollment,
	disableTotp,
} from "@/app/actions/totp-actions";

type UserInfo = {
	id: string;
	name?: string | null;
	username?: string | null;
	email?: string | null;
	avatarUrl?: string | null;
};

/** Safe, display-only passkey summary returned by GET /api/users/passkey. */
type PasskeyItem = {
	id: string;
	name: string | null;
	synced: boolean;
	deviceBound: boolean;
	createdAt: string;
	lastUsedAt: string | null;
};

function formatDate(iso: string | null): string {
	if (!iso) return "Never";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "Unknown";
	return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof UserCircle; children: React.ReactNode }) {
	return (
		<section className="rounded-xl border border-brand-muted p-6">
			<h2 className="mb-4 flex items-center gap-2 text-lg font-medium">
				<Icon className="h-5 w-5" />
				{title}
			</h2>
			{children}
		</section>
	);
}

function ErrorBanner({ message }: { message: string | null }) {
	if (!message) return null;
	return <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{message}</p>;
}

function SuccessBanner({ message }: { message: string | null }) {
	if (!message) return null;
	return <p className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/50 dark:text-green-200">{message}</p>;
}

const inputClass =
	"w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50";

const btnPrimary =
	"rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-50";

const iconBtn =
	"rounded-full p-1.5 text-muted-foreground hover:bg-brand-muted/30 hover:text-foreground disabled:opacity-50";

const iconBtnDanger =
	"rounded-full p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:hover:bg-red-950/50 dark:hover:text-red-200";

export default function SettingsPage() {
	const [user, setUser] = useState<UserInfo | null>(null);

	// Profile
	const [displayName, setDisplayName] = useState("");
	const [profileError, setProfileError] = useState<string | null>(null);
	const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
	const [profilePending, startProfileTransition] = useTransition();

	// Avatar
	const avatarInputRef = useRef<HTMLInputElement>(null);
	const [avatarUploading, setAvatarUploading] = useState(false);
	const [avatarError, setAvatarError] = useState<string | null>(null);
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

	// Passkey
	const [passkeys, setPasskeys] = useState<PasskeyItem[] | null>(null);
	const [passkeyPending, setPasskeyPending] = useState(false);
	const [passkeyError, setPasskeyError] = useState<string | null>(null);
	const [passkeySuccess, setPasskeySuccess] = useState<string | null>(null);
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [savingRenameId, setSavingRenameId] = useState<string | null>(null);
	const [verifyingId, setVerifyingId] = useState<string | null>(null);

	// Password
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
	const [passwordPending, startPasswordTransition] = useTransition();

	// Authenticator app (TOTP)
	const [totpStatus, setTotpStatus] = useState<{
		enrolled: boolean;
		createdAt: string | null;
		lastUsedAt: string | null;
	} | null>(null);
	const [totpEnroll, setTotpEnroll] = useState<{ otpauthUri: string; secret: string } | null>(null);
	const [totpCode, setTotpCode] = useState("");
	const [totpError, setTotpError] = useState<string | null>(null);
	const [totpSuccess, setTotpSuccess] = useState<string | null>(null);
	const [totpBusy, setTotpBusy] = useState(false);
	const [confirmingTotpRemove, setConfirmingTotpRemove] = useState(false);
	const [totpRemoving, setTotpRemoving] = useState(false);

	useEffect(() => {
		getCurrentUser().then(async (session) => {
			if (!session?.id) return;
			const u = await getUserById(session.id);
			if (!u) return;
			setUser({ id: u.id, name: u.name, username: u.username, email: u.email, avatarUrl: u.avatarUrl });
			setDisplayName(u.name ?? "");
			setAvatarPreview(u.avatarUrl ?? null);
		});
	}, []);

	const loadPasskeys = useCallback(async () => {
		try {
			const res = await fetch("/api/users/passkey");
			if (!res.ok) throw new Error("Failed to load passkeys.");
			const data = (await res.json()) as { passkeys: PasskeyItem[] };
			setPasskeys(data.passkeys ?? []);
		} catch {
			setPasskeys([]);
		}
	}, []);

	useEffect(() => {
		if (!user?.id) return;
		void loadPasskeys();
	}, [user?.id, loadPasskeys]);

	const loadTotpStatus = useCallback(async () => {
		try {
			setTotpStatus(await getTotpStatus());
		} catch {
			setTotpStatus({ enrolled: false, createdAt: null, lastUsedAt: null });
		}
	}, []);

	useEffect(() => {
		if (!user?.id) return;
		void loadTotpStatus();
	}, [user?.id, loadTotpStatus]);

	const handleProfileSave = (e: React.FormEvent) => {
		e.preventDefault();
		setProfileError(null);
		setProfileSuccess(null);
		startProfileTransition(async () => {
			try {
				await updateDisplayName(displayName);
				setProfileSuccess("Profile updated.");
			} catch (err) {
				setProfileError(err instanceof Error ? err.message : "Failed to update profile.");
			}
		});
	};

	const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file || !user?.id) return;
		setAvatarError(null);
		setAvatarUploading(true);
		try {
			const body = new FormData();
			body.set("userId", user.id);
			body.set("file", file);
			const res = await fetch("/api/users/avatar", { method: "POST", body });
			const json = (await res.json()) as { picture?: string; error_description?: string; error?: string };
			if (!res.ok) throw new Error(json.error_description ?? json.error ?? "Upload failed.");
			if (json.picture) setAvatarPreview(json.picture);
		} catch (err) {
			setAvatarError(err instanceof Error ? err.message : "Failed to upload avatar.");
		} finally {
			setAvatarUploading(false);
		}
	};

	const handleEnrollPasskey = async () => {
		if (!user?.id) return;
		setPasskeyError(null);
		setPasskeySuccess(null);
		setPasskeyPending(true);
		try {
			const challengeRes = await fetch("/api/users/passkey/challenge", { method: "POST" });
			if (!challengeRes.ok) {
				const body = (await challengeRes.json()) as { error_description?: string };
				throw new Error(body.error_description ?? "Failed to get passkey challenge.");
			}
			const { challengeId, options } = (await challengeRes.json()) as {
				challengeId: string;
				options: PublicKeyCredentialCreationOptionsJSON;
			};

			const regResponse = await startRegistration(options);

			const registerRes = await fetch("/api/users/passkey/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ challengeId, registrationResponse: regResponse }),
			});
			if (!registerRes.ok) {
				const body = (await registerRes.json()) as { error_description?: string };
				throw new Error(body.error_description ?? "Passkey registration failed.");
			}
			await loadPasskeys();
			setPasskeySuccess("Passkey added.");
		} catch (err) {
			if (err instanceof Error && err.name === "NotAllowedError") {
				// user cancelled or timed out — silent
			} else if (err instanceof Error && err.name === "InvalidStateError") {
				// excludeCredentials matched: this device/authenticator already holds a passkey.
				setPasskeyError("This device already has a passkey for your account.");
			} else {
				setPasskeyError(err instanceof Error ? err.message : "Passkey enrollment failed.");
			}
		} finally {
			setPasskeyPending(false);
		}
	};

	const startRename = (pk: PasskeyItem) => {
		setPasskeyError(null);
		setPasskeySuccess(null);
		setConfirmingDeleteId(null);
		setRenamingId(pk.id);
		setRenameValue(pk.name ?? "");
	};

	const cancelRename = () => {
		setRenamingId(null);
		setRenameValue("");
	};

	const handleRename = async (pk: PasskeyItem) => {
		const name = renameValue.trim();
		if (!name) {
			setPasskeyError("Passkey name cannot be empty.");
			return;
		}
		setPasskeyError(null);
		setPasskeySuccess(null);
		setSavingRenameId(pk.id);
		try {
			const res = await fetch(`/api/users/passkey/${encodeURIComponent(pk.id)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (!res.ok) {
				const body = (await res.json()) as { error_description?: string };
				throw new Error(body.error_description ?? "Failed to rename passkey.");
			}
			await loadPasskeys();
			cancelRename();
		} catch (err) {
			setPasskeyError(err instanceof Error ? err.message : "Failed to rename passkey.");
		} finally {
			setSavingRenameId(null);
		}
	};

	const requestDelete = (id: string) => {
		setPasskeyError(null);
		setPasskeySuccess(null);
		setRenamingId(null);
		setConfirmingDeleteId(id);
	};

	const cancelDelete = () => setConfirmingDeleteId(null);

	const handleDelete = async (pk: PasskeyItem) => {
		setPasskeyError(null);
		setPasskeySuccess(null);
		setDeletingId(pk.id);
		try {
			const res = await fetch(`/api/users/passkey/${encodeURIComponent(pk.id)}`, {
				method: "DELETE",
			});
			if (!res.ok) {
				const body = (await res.json()) as { error_description?: string };
				throw new Error(body.error_description ?? "Failed to remove passkey.");
			}
			setConfirmingDeleteId(null);
			await loadPasskeys();
			setPasskeySuccess("Passkey removed.");
		} catch (err) {
			setPasskeyError(err instanceof Error ? err.message : "Failed to remove passkey.");
		} finally {
			setDeletingId(null);
		}
	};

	const handleVerify = async (pk: PasskeyItem) => {
		setPasskeyError(null);
		setPasskeySuccess(null);
		setConfirmingDeleteId(null);
		setVerifyingId(pk.id);
		try {
			const challengeRes = await fetch("/api/users/passkey/verify/challenge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: pk.id }),
			});
			if (!challengeRes.ok) {
				const body = (await challengeRes.json()) as { error_description?: string };
				throw new Error(body.error_description ?? "Failed to start verification.");
			}
			const { challengeId, options } = (await challengeRes.json()) as {
				challengeId: string;
				options: PublicKeyCredentialRequestOptionsJSON;
			};

			const authResponse = await startAuthentication(options);

			const verifyRes = await fetch("/api/users/passkey/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ challengeId, authenticationResponse: authResponse }),
			});
			if (!verifyRes.ok) {
				const body = (await verifyRes.json()) as { error_description?: string };
				throw new Error(body.error_description ?? "Verification failed.");
			}
			await loadPasskeys();
			setPasskeySuccess(`"${pk.name ?? "Passkey"}" works on this device.`);
		} catch (err) {
			if (err instanceof Error && err.name === "NotAllowedError") {
				// The device couldn't produce this credential (or the user cancelled). We can't be
				// certain it's gone, so we guide rather than auto-delete.
				setPasskeyError(
					"Couldn't use this passkey on this device. If you no longer have it, remove it."
				);
			} else {
				setPasskeyError(err instanceof Error ? err.message : "Verification failed.");
			}
		} finally {
			setVerifyingId(null);
		}
	};

	const handleBeginTotp = async () => {
		setTotpError(null);
		setTotpSuccess(null);
		setTotpBusy(true);
		try {
			const data = await beginTotpEnrollment();
			setTotpEnroll(data);
			setTotpCode("");
		} catch (err) {
			setTotpError(err instanceof Error ? err.message : "Failed to start enrollment.");
		} finally {
			setTotpBusy(false);
		}
	};

	const handleConfirmTotp = async (e: React.FormEvent) => {
		e.preventDefault();
		setTotpError(null);
		setTotpSuccess(null);
		setTotpBusy(true);
		try {
			await confirmTotpEnrollment(totpCode);
			setTotpEnroll(null);
			setTotpCode("");
			await loadTotpStatus();
			setTotpSuccess("Authenticator app enabled.");
		} catch (err) {
			setTotpError(err instanceof Error ? err.message : "Failed to verify code.");
		} finally {
			setTotpBusy(false);
		}
	};

	const cancelTotpEnroll = () => {
		setTotpEnroll(null);
		setTotpCode("");
		setTotpError(null);
	};

	const handleRemoveTotp = async () => {
		setTotpError(null);
		setTotpSuccess(null);
		setTotpRemoving(true);
		try {
			await disableTotp();
			setConfirmingTotpRemove(false);
			await loadTotpStatus();
			setTotpSuccess("Authenticator app removed.");
		} catch (err) {
			setTotpError(err instanceof Error ? err.message : "Failed to remove authenticator app.");
		} finally {
			setTotpRemoving(false);
		}
	};

	const handlePasswordSave = (e: React.FormEvent) => {
		e.preventDefault();
		setPasswordError(null);
		setPasswordSuccess(null);
		if (newPassword !== confirmPassword) {
			setPasswordError("New passwords do not match.");
			return;
		}
		if (newPassword.length < 8) {
			setPasswordError("New password must be at least 8 characters.");
			return;
		}
		startPasswordTransition(async () => {
			try {
				await changePassword(currentPassword, newPassword);
				setPasswordSuccess("Password changed successfully.");
				setCurrentPassword("");
				setNewPassword("");
				setConfirmPassword("");
			} catch (err) {
				setPasswordError(err instanceof Error ? err.message : "Failed to change password.");
			}
		});
	};

	if (!user) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<div className="mb-8 flex items-center gap-2 text-xl font-semibold">
				<UserCircle className="h-6 w-6" />
				Settings
			</div>

			<div className="mx-auto grid max-w-xl gap-6 lg:max-w-5xl lg:grid-cols-2">
				{/* Profile — name, username, avatar together */}
				<SectionCard title="Profile" icon={UserCircle}>
					<ErrorBanner message={profileError ?? avatarError} />
					<SuccessBanner message={profileSuccess} />

					{/* Avatar row */}
					<div className="mb-5 flex items-center gap-4">
						{avatarPreview ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={avatarPreview}
								alt=""
								className="h-16 w-16 shrink-0 rounded-full border border-brand-muted object-cover"
							/>
						) : (
							<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-dashed border-brand-muted">
								<ImageIcon className="h-6 w-6 text-muted-foreground" />
							</div>
						)}
						<div>
							<input
								ref={avatarInputRef}
								type="file"
								accept="image/jpeg,image/png,image/webp"
								className="hidden"
								onChange={handleAvatarChange}
							/>
							<button
								type="button"
								disabled={avatarUploading}
								onClick={() => avatarInputRef.current?.click()}
								className="flex items-center gap-2 rounded-full border border-brand-muted px-4 py-2 text-sm font-medium hover:bg-brand-muted/30 disabled:opacity-50"
							>
								{avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
								{avatarUploading ? "Uploading…" : "Change avatar"}
							</button>
							<p className="mt-1 text-xs text-muted-foreground">JPEG, PNG, or WEBP · Max 5 MB</p>
						</div>
					</div>

					<form onSubmit={handleProfileSave} className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label className="mb-1 block text-sm text-muted-foreground">Display name</label>
								<input
									type="text"
									value={displayName}
									onChange={(e) => setDisplayName(e.target.value)}
									placeholder="Your name"
									className={inputClass}
								/>
							</div>
							<div>
								<label className="mb-1 block text-sm text-muted-foreground">Username</label>
								<input type="text" value={user.username ?? ""} readOnly disabled className={inputClass} />
							</div>
						</div>
						<button type="submit" disabled={profilePending} className={btnPrimary}>
							{profilePending ? "Saving…" : "Save profile"}
						</button>
					</form>
				</SectionCard>

				{/* Passkeys — above password */}
				<SectionCard title="Passkeys" icon={Fingerprint}>
					<ErrorBanner message={passkeyError} />
					<SuccessBanner message={passkeySuccess} />
					<p className="mb-4 text-sm text-muted-foreground">
						Passkeys let you sign in without a password. Add one for each device you use.
					</p>
					{passkeys === null ? (
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					) : (
						<div className="space-y-3">
							{passkeys.length === 0 ? (
								<p className="text-sm text-muted-foreground">No passkeys yet.</p>
							) : (
								<ul className="divide-y divide-brand-muted/40 overflow-hidden rounded-xl border border-brand-muted">
									{passkeys.map((pk) => (
										<li key={pk.id} className="flex items-center gap-3 p-3">
											<Fingerprint className="h-5 w-5 shrink-0 text-muted-foreground" />
											{renamingId === pk.id ? (
												<div className="flex flex-1 items-center gap-2">
													<input
														autoFocus
														value={renameValue}
														onChange={(e) => setRenameValue(e.target.value)}
														maxLength={60}
														placeholder="Passkey name"
														className={inputClass}
														onKeyDown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																void handleRename(pk);
															} else if (e.key === "Escape") {
																cancelRename();
															}
														}}
													/>
													<button
														type="button"
														aria-label="Save name"
														disabled={savingRenameId === pk.id}
														onClick={() => handleRename(pk)}
														className={iconBtn}
													>
														{savingRenameId === pk.id ? (
															<Loader2 className="h-4 w-4 animate-spin" />
														) : (
															<Check className="h-4 w-4" />
														)}
													</button>
													<button
														type="button"
														aria-label="Cancel rename"
														disabled={savingRenameId === pk.id}
														onClick={cancelRename}
														className={iconBtn}
													>
														<X className="h-4 w-4" />
													</button>
												</div>
											) : (
												<>
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-2">
															<span className="truncate text-sm font-medium">
																{pk.name ?? "Unnamed passkey"}
															</span>
															<span className="shrink-0 rounded-full border border-brand-muted px-2 py-0.5 text-xs text-muted-foreground">
																{pk.synced ? "Synced" : "This device"}
															</span>
														</div>
														<p className="mt-0.5 text-xs text-muted-foreground">
															Added {formatDate(pk.createdAt)} · Last used {formatDate(pk.lastUsedAt)}
														</p>
													</div>
													{confirmingDeleteId === pk.id ? (
														<div className="flex shrink-0 items-center gap-2">
															<span className="text-xs text-red-700 dark:text-red-200">Remove?</span>
															<button
																type="button"
																onClick={() => handleDelete(pk)}
																disabled={deletingId === pk.id}
																className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-900/60"
															>
																{deletingId === pk.id ? (
																	<Loader2 className="h-3.5 w-3.5 animate-spin" />
																) : (
																	<Check className="h-3.5 w-3.5" />
																)}
																Remove
															</button>
															<button
																type="button"
																onClick={cancelDelete}
																disabled={deletingId === pk.id}
																className="inline-flex items-center gap-1 rounded-full border border-brand-muted px-3 py-1 text-xs hover:bg-brand-muted/30 disabled:opacity-50"
															>
																<X className="h-3.5 w-3.5" />
																Cancel
															</button>
														</div>
													) : (
														<div className="flex shrink-0 items-center gap-1">
															<button
																type="button"
																aria-label="Verify passkey on this device"
																title="Verify on this device"
																disabled={verifyingId === pk.id}
																onClick={() => handleVerify(pk)}
																className={iconBtn}
															>
																{verifyingId === pk.id ? (
																	<Loader2 className="h-4 w-4 animate-spin" />
																) : (
																	<BadgeCheck className="h-4 w-4" />
																)}
															</button>
															<button
																type="button"
																aria-label="Rename passkey"
																disabled={verifyingId === pk.id}
																onClick={() => startRename(pk)}
																className={iconBtn}
															>
																<Pencil className="h-4 w-4" />
															</button>
															<button
																type="button"
																aria-label="Remove passkey"
																disabled={verifyingId === pk.id}
																onClick={() => requestDelete(pk.id)}
																className={iconBtnDanger}
															>
																<Trash2 className="h-4 w-4" />
															</button>
														</div>
													)}
												</>
											)}
										</li>
									))}
								</ul>
							)}
							<button
								type="button"
								disabled={passkeyPending}
								onClick={handleEnrollPasskey}
								className="flex items-center gap-2 rounded-full border border-brand-muted px-4 py-2 text-sm font-medium hover:bg-brand-muted/20 disabled:opacity-50"
							>
								{passkeyPending ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										Waiting for device…
									</>
								) : (
									<>
										<Fingerprint className="h-4 w-4" />
										Add a passkey
									</>
								)}
							</button>
						</div>
					)}
				</SectionCard>

				{/* Password */}
				<SectionCard title="Change password" icon={Lock}>
					<ErrorBanner message={passwordError} />
					<SuccessBanner message={passwordSuccess} />
					<form onSubmit={handlePasswordSave} className="space-y-4">
						<div>
							<label className="mb-1 block text-sm text-muted-foreground">Current password</label>
							<input
								type="password"
								value={currentPassword}
								onChange={(e) => setCurrentPassword(e.target.value)}
								autoComplete="current-password"
								required
								className={inputClass}
							/>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label className="mb-1 block text-sm text-muted-foreground">New password</label>
								<input
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									autoComplete="new-password"
									required
									className={inputClass}
								/>
							</div>
							<div>
								<label className="mb-1 block text-sm text-muted-foreground">Confirm new password</label>
								<input
									type="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									autoComplete="new-password"
									required
									className={inputClass}
								/>
							</div>
						</div>
						<button type="submit" disabled={passwordPending} className={btnPrimary}>
							{passwordPending ? "Changing…" : "Change password"}
						</button>
					</form>
				</SectionCard>

				{/* Authenticator app (TOTP) — second MFA method alongside email */}
				<SectionCard title="Authenticator app" icon={Smartphone}>
					<ErrorBanner message={totpError} />
					<SuccessBanner message={totpSuccess} />
					<p className="mb-4 text-sm text-muted-foreground">
						Use an authenticator app (like Google Authenticator) for two-factor sign-in codes.
					</p>
					{totpStatus === null ? (
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					) : totpStatus.enrolled ? (
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
									Added {formatDate(totpStatus.createdAt)} · Last used {formatDate(totpStatus.lastUsedAt)}
								</p>
							</div>
							{confirmingTotpRemove ? (
								<div className="flex shrink-0 items-center gap-2">
									<span className="text-xs text-red-700 dark:text-red-200">Remove?</span>
									<button
										type="button"
										onClick={handleRemoveTotp}
										disabled={totpRemoving}
										className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-900/60"
									>
										{totpRemoving ? (
											<Loader2 className="h-3.5 w-3.5 animate-spin" />
										) : (
											<Check className="h-3.5 w-3.5" />
										)}
										Remove
									</button>
									<button
										type="button"
										onClick={() => setConfirmingTotpRemove(false)}
										disabled={totpRemoving}
										className="inline-flex items-center gap-1 rounded-full border border-brand-muted px-3 py-1 text-xs hover:bg-brand-muted/30 disabled:opacity-50"
									>
										<X className="h-3.5 w-3.5" />
										Cancel
									</button>
								</div>
							) : (
								<button
									type="button"
									aria-label="Remove authenticator app"
									onClick={() => {
										setTotpError(null);
										setTotpSuccess(null);
										setConfirmingTotpRemove(true);
									}}
									className={iconBtnDanger}
								>
									<Trash2 className="h-4 w-4" />
								</button>
							)}
						</div>
					) : totpEnroll ? (
						<form onSubmit={handleConfirmTotp} className="space-y-4">
							<p className="text-sm text-muted-foreground">
								Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
							</p>
							<div className="flex justify-center">
								<div className="rounded-xl bg-white p-3">
									<QRCodeSVG value={totpEnroll.otpauthUri} size={176} />
								</div>
							</div>
							<div>
								<p className="mb-1 text-xs text-muted-foreground">Can&apos;t scan? Enter this key manually:</p>
								<code className="block break-all rounded-xl border border-brand-muted bg-brand-muted/20 px-3 py-2 text-sm tracking-wider">
									{totpEnroll.secret}
								</code>
							</div>
							<div>
								<label className="mb-1 block text-sm text-muted-foreground">Verification code</label>
								<input
									type="text"
									inputMode="numeric"
									autoComplete="one-time-code"
									pattern="[0-9]{6}"
									maxLength={6}
									required
									value={totpCode}
									onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
									className={`${inputClass} text-center tracking-[0.3em]`}
									placeholder="000000"
								/>
							</div>
							<div className="flex items-center gap-2">
								<button type="submit" disabled={totpBusy || totpCode.length !== 6} className={btnPrimary}>
									{totpBusy ? "Verifying…" : "Verify and enable"}
								</button>
								<button
									type="button"
									onClick={cancelTotpEnroll}
									disabled={totpBusy}
									className="rounded-full border border-brand-muted px-4 py-2 text-sm font-medium hover:bg-brand-muted/30 disabled:opacity-50"
								>
									Cancel
								</button>
							</div>
						</form>
					) : (
						<button
							type="button"
							disabled={totpBusy}
							onClick={handleBeginTotp}
							className="flex items-center gap-2 rounded-full border border-brand-muted px-4 py-2 text-sm font-medium hover:bg-brand-muted/20 disabled:opacity-50"
						>
							{totpBusy ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									Preparing…
								</>
							) : (
								<>
									<Smartphone className="h-4 w-4" />
									Add authenticator app
								</>
							)}
						</button>
					)}
				</SectionCard>

			</div>
		</main>
	);
}
