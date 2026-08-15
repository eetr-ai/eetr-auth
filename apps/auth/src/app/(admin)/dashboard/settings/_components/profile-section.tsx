import type { ChangeEvent, FormEvent, RefObject } from "react";
import { ImageIcon, Upload, UserCircle } from "lucide-react";
import { Banner, Button, FormField, Input, SectionCard } from "@/components/ui";

interface ProfileSectionProps {
	displayName: string;
	onDisplayNameChange: (value: string) => void;
	username: string;
	avatarPreview: string | null;
	avatarUploading: boolean;
	/** A photo has been staged and applies when the form is saved. */
	avatarPending: boolean;
	avatarInputRef: RefObject<HTMLInputElement | null>;
	onAvatarChange: (e: ChangeEvent<HTMLInputElement>) => void;
	pending: boolean;
	error: string | null;
	success: string | null;
	onSubmit: (e: FormEvent) => void;
}

export function ProfileSection({
	displayName,
	onDisplayNameChange,
	username,
	avatarPreview,
	avatarUploading,
	avatarPending,
	avatarInputRef,
	onAvatarChange,
	pending,
	error,
	success,
	onSubmit,
}: ProfileSectionProps) {
	return (
		<SectionCard title="Profile" icon={UserCircle}>
			<Banner variant="error" message={error} />
			<Banner variant="success" message={success} />

			{/* Avatar row */}
			<div className="mb-5 flex items-center gap-4">
				{avatarPreview ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={avatarPreview}
						alt=""
						className="h-16 w-16 shrink-0 rounded-full border border-border object-cover"
					/>
				) : (
					<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
						<ImageIcon className="h-6 w-6 text-muted-foreground" />
					</div>
				)}
				<div>
					<input
						ref={avatarInputRef}
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className="hidden"
						onChange={onAvatarChange}
					/>
					<Button
						type="button"
						variant="secondary"
						loading={avatarUploading}
						icon={Upload}
						onClick={() => avatarInputRef.current?.click()}
					>
						{avatarUploading ? "Uploading…" : "Change avatar"}
					</Button>
					<p className="mt-1 text-xs text-muted-foreground">
						{avatarPending ? "Applied when you save." : "JPEG, PNG, or WEBP · Max 5 MB"}
					</p>
				</div>
			</div>

			<form onSubmit={onSubmit} className="space-y-4">
				<div className="grid gap-4 sm:grid-cols-2">
					<FormField label="Display name">
						<Input
							type="text"
							value={displayName}
							onChange={(e) => onDisplayNameChange(e.target.value)}
							placeholder="Your name"
						/>
					</FormField>
					<FormField label="Username">
						<Input type="text" value={username} readOnly disabled />
					</FormField>
				</div>
				<Button type="submit" disabled={pending}>
					{pending ? "Saving…" : "Save profile"}
				</Button>
			</form>
		</SectionCard>
	);
}
