import type { ChangeEvent, FormEvent, RefObject } from "react";
import type { ReducerAction } from "@eetr/react-reducer-utils";
import { ImageIcon, Upload } from "lucide-react";
import { Banner, Button, Input, Label } from "@/components/ui";
import type { SiteSettingsDto } from "@/lib/services/site-settings.service";
import { SetupPageActionType, type SetupTabId } from "./state";

interface SiteIdentitySectionProps {
	activeTab: SetupTabId;
	siteSettings: SiteSettingsDto | null;
	siteTitleInput: string;
	siteUrlInput: string;
	cdnUrlInput: string;
	mfaEnabledInput: boolean;
	siteError: string | null;
	siteSaving: boolean;
	logoUploading: boolean;
	logoInputRef: RefObject<HTMLInputElement | null>;
	dispatch: (action: ReducerAction<SetupPageActionType>) => void;
	onSubmit: (e: FormEvent) => void;
	onLogoChange: (e: ChangeEvent<HTMLInputElement>) => void;
	onClearLogo: () => void;
}

export function SiteIdentitySection({
	activeTab,
	siteSettings,
	siteTitleInput,
	siteUrlInput,
	cdnUrlInput,
	mfaEnabledInput,
	siteError,
	siteSaving,
	logoUploading,
	logoInputRef,
	dispatch,
	onSubmit,
	onLogoChange,
	onClearLogo,
}: SiteIdentitySectionProps) {
	const previewLogoUrl = siteSettings?.displayLogoUrl ?? null;

	return (
		<section
			className={`mt-6 rounded-card border border-border p-6 ${activeTab !== "site" ? "hidden" : ""}`}
			role="tabpanel"
			id="setup-panel-site"
			aria-labelledby="setup-tab-site"
			aria-hidden={activeTab !== "site"}
		>
			<h2 className="mb-4 text-lg font-medium">Site identity</h2>
			<Banner variant="error" message={siteError} />
			<form onSubmit={onSubmit} className="space-y-4">
				<div className="grid gap-4 md:grid-cols-2">
					<div>
						<Label>Site title</Label>
						<Input
							type="text"
							value={siteTitleInput}
							onChange={(e) =>
								dispatch({
									type: SetupPageActionType.SET_SITE_TITLE_INPUT,
									data: e.target.value,
								})
							}
							placeholder="Eetr Auth"
						/>
					</div>
					<div>
						<Label>Site URL</Label>
						<Input
							type="url"
							value={siteUrlInput}
							onChange={(e) =>
								dispatch({
									type: SetupPageActionType.SET_SITE_URL_INPUT,
									data: e.target.value,
								})
							}
							placeholder="https://example.com"
						/>
					</div>
					<div className="md:col-span-2">
						<Label>CDN URL</Label>
						<Input
							type="url"
							value={cdnUrlInput}
							onChange={(e) =>
								dispatch({
									type: SetupPageActionType.SET_CDN_URL_INPUT,
									data: e.target.value,
								})
							}
							placeholder="https://cdn.example.com"
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							Used for public URLs to the uploaded site logo. Optional if you only use the default
							static logo.
						</p>
					</div>
					<div className="md:col-span-2">
						<label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
							<input
								type="checkbox"
								checked={mfaEnabledInput}
								disabled={!siteSettings?.mfaCanEnable && !mfaEnabledInput}
								onChange={(e) =>
									dispatch({
										type: SetupPageActionType.SET_MFA_ENABLED_INPUT,
										data: e.target.checked,
									})
								}
								className="mt-1 rounded border-border"
							/>
							<span>
								<span className="font-medium">Require email verification (MFA) at sign-in</span>
								<span className="mt-1 block text-xs font-normal text-muted-foreground">
									Users receive a 6-digit code after entering their password. Requires Site URL,
									RESEND_API_KEY, and an email on each account. Sender is no-reply@your site
									domain (verify the domain in Resend).
								</span>
							</span>
						</label>
					</div>
				</div>

				<div className="flex flex-wrap items-end gap-4">
					<div>
						<span className="mb-1 block text-sm text-muted-foreground">Logo</span>
						<div className="flex items-center gap-3">
							{previewLogoUrl ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={previewLogoUrl}
									alt=""
									className="h-14 w-14 rounded-lg border border-border object-contain"
								/>
							) : (
								<div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-border">
									<ImageIcon className="h-6 w-6 text-muted-foreground" />
								</div>
							)}
							<input
								ref={logoInputRef}
								type="file"
								accept="image/jpeg,image/png,image/webp"
								className="hidden"
								onChange={onLogoChange}
							/>
							<Button
								type="button"
								variant="secondary"
								loading={logoUploading}
								icon={Upload}
								onClick={() => logoInputRef.current?.click()}
							>
								Upload logo
							</Button>
							{siteSettings?.logoKey ? (
								<button
									type="button"
									disabled={logoUploading}
									onClick={onClearLogo}
									className="text-sm text-muted-foreground underline hover:text-foreground disabled:opacity-50"
								>
									Use default logo
								</button>
							) : null}
						</div>
					</div>
				</div>

				<div>
					<Button type="submit" loading={siteSaving}>
						{siteSaving ? "Saving…" : "Save site settings"}
					</Button>
				</div>
			</form>
		</section>
	);
}
