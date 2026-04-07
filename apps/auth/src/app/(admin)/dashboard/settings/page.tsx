"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";
import { UserCircle, Lock, ImageIcon, Upload, Fingerprint, Loader2 } from "lucide-react";
import { updateDisplayName, changePassword } from "@/app/actions/user-settings-actions";
// updateUsername is intentionally omitted — username is read-only for users
import { getCurrentUser, getUserById } from "@/app/actions/user-actions";

type UserInfo = {
	id: string;
	name?: string | null;
	username?: string | null;
	email?: string | null;
	avatarUrl?: string | null;
};

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
	return <p className="mb-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">{message}</p>;
}

function SuccessBanner({ message }: { message: string | null }) {
	if (!message) return null;
	return <p className="mb-3 rounded-xl bg-green-950/50 px-3 py-2 text-sm text-green-200">{message}</p>;
}

const inputClass =
	"w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50";

const btnPrimary =
	"rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-50";

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
	const [hasPasskey, setHasPasskey] = useState<boolean | null>(null);
	const [passkeyPending, setPasskeyPending] = useState(false);
	const [passkeyError, setPasskeyError] = useState<string | null>(null);
	const [passkeySuccess, setPasskeySuccess] = useState<string | null>(null);

	// Password
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
	const [passwordPending, startPasswordTransition] = useTransition();

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

	useEffect(() => {
		if (!user?.id) return;
		fetch("/api/users/passkey/has")
			.then((r) => r.json())
			.then((data) => setHasPasskey(Boolean((data as { hasPasskey?: boolean }).hasPasskey)))
			.catch(() => setHasPasskey(false));
	}, [user?.id]);

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
			setHasPasskey(true);
			setPasskeySuccess("Passkey enrolled successfully.");
		} catch (err) {
			if (err instanceof Error && err.name === "NotAllowedError") {
				// user cancelled
			} else {
				setPasskeyError(err instanceof Error ? err.message : "Passkey enrollment failed.");
			}
		} finally {
			setPasskeyPending(false);
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

			<div className="mx-auto max-w-xl space-y-6">
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

				{/* Passkey — above password */}
				<SectionCard title="Passkey" icon={Fingerprint}>
					<ErrorBanner message={passkeyError} />
					<SuccessBanner message={passkeySuccess} />
					{hasPasskey === null ? (
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					) : hasPasskey ? (
						<div className="flex items-center gap-2 text-sm text-green-400">
							<Fingerprint className="h-4 w-4" />
							Passkey enrolled
						</div>
					) : (
						<div className="space-y-3">
							<p className="text-sm text-muted-foreground">
								No passkey enrolled. Create one to sign in without a password.
							</p>
							<button
								type="button"
								disabled={passkeyPending}
								onClick={handleEnrollPasskey}
								className="flex items-center gap-2 rounded-full border border-brand-muted px-4 py-2 text-sm font-medium hover:bg-brand-muted/20 disabled:opacity-50"
							>
								{passkeyPending ? (
									<><Loader2 className="h-4 w-4 animate-spin" />Waiting for device…</>
								) : (
									<><Fingerprint className="h-4 w-4" />Create a passkey</>
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
			</div>
		</main>
	);
}
