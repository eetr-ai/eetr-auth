"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";
import { UserCircle } from "lucide-react";
import { FullPageSpinner } from "@/components/ui";
import { updateDisplayName, changePassword } from "@/app/actions/user-settings-actions";
// updateUsername is intentionally omitted — username is read-only for users
import { getCurrentUser, getUserById } from "@/app/actions/user-actions";
import {
	getTotpStatus,
	beginTotpEnrollment,
	confirmTotpEnrollment,
	disableTotp,
} from "@/app/actions/totp-actions";
import { ProfileSection } from "./_components/profile-section";
import { PasskeysSection } from "./_components/passkeys-section";
import { ChangePasswordSection } from "./_components/change-password-section";
import { AuthenticatorSection } from "./_components/authenticator-section";
import type { PasskeyItem } from "./_components/passkey-list-item";

type UserInfo = {
	id: string;
	name?: string | null;
	username?: string | null;
	email?: string | null;
	avatarUrl?: string | null;
};

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
		return <FullPageSpinner />;
	}

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<div className="mb-8 flex items-center gap-2 text-xl font-semibold">
				<UserCircle className="h-6 w-6" />
				Settings
			</div>

			<div className="mx-auto grid max-w-xl gap-6 lg:max-w-5xl lg:grid-cols-2">
				{/* Profile — name, username, avatar together */}
				<ProfileSection
					displayName={displayName}
					onDisplayNameChange={setDisplayName}
					username={user.username ?? ""}
					avatarPreview={avatarPreview}
					avatarUploading={avatarUploading}
					avatarInputRef={avatarInputRef}
					onAvatarChange={handleAvatarChange}
					pending={profilePending}
					error={profileError ?? avatarError}
					success={profileSuccess}
					onSubmit={handleProfileSave}
				/>

				{/* Passkeys — above password */}
				<PasskeysSection
					passkeys={passkeys}
					error={passkeyError}
					success={passkeySuccess}
					pending={passkeyPending}
					onEnroll={handleEnrollPasskey}
					renamingId={renamingId}
					renameValue={renameValue}
					onRenameValueChange={setRenameValue}
					savingRenameId={savingRenameId}
					onRename={handleRename}
					onCancelRename={cancelRename}
					onStartRename={startRename}
					confirmingDeleteId={confirmingDeleteId}
					deletingId={deletingId}
					onRequestDelete={requestDelete}
					onDelete={handleDelete}
					onCancelDelete={cancelDelete}
					verifyingId={verifyingId}
					onVerify={handleVerify}
				/>

				{/* Password */}
				<ChangePasswordSection
					currentPassword={currentPassword}
					onCurrentPasswordChange={setCurrentPassword}
					newPassword={newPassword}
					onNewPasswordChange={setNewPassword}
					confirmPassword={confirmPassword}
					onConfirmPasswordChange={setConfirmPassword}
					pending={passwordPending}
					error={passwordError}
					success={passwordSuccess}
					onSubmit={handlePasswordSave}
				/>

				{/* Authenticator app (TOTP) — second MFA method alongside email */}
				<AuthenticatorSection
					status={totpStatus}
					enroll={totpEnroll}
					code={totpCode}
					onCodeChange={setTotpCode}
					busy={totpBusy}
					error={totpError}
					success={totpSuccess}
					confirmingRemove={confirmingTotpRemove}
					removing={totpRemoving}
					onBegin={handleBeginTotp}
					onConfirm={handleConfirmTotp}
					onCancelEnroll={cancelTotpEnroll}
					onRequestRemove={() => {
						setTotpError(null);
						setTotpSuccess(null);
						setConfirmingTotpRemove(true);
					}}
					onRemove={handleRemoveTotp}
					onCancelRemove={() => setConfirmingTotpRemove(false)}
				/>
			</div>
		</main>
	);
}
