"use client";

import { useState, useTransition } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { submitTestUserSignIn } from "@/app/actions/sign-in-actions";
import type { UserRecord } from "@/lib/repositories/admin.repository";

interface TestUserPickerProps {
	/** Test users granted the pending test client's environment. */
	users: UserRecord[];
	/** The client's registered name, or its client_id when unnamed. */
	clientName: string;
	callbackUrl: string;
}

/**
 * The sign-in surface a test client gets instead of the password form: pick a persona,
 * and you are signed in as it. There is no secret here by design -- see the warning copy
 * below, which is deliberately shown to whoever loads the page rather than buried in docs.
 */
export function TestUserPicker({ users, clientName, callbackUrl }: TestUserPickerProps) {
	const [pendingUserId, setPendingUserId] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const signInAs = (userId: string) => {
		setPendingUserId(userId);
		startTransition(async () => {
			await submitTestUserSignIn(userId, callbackUrl);
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex items-start gap-2 rounded-card bg-warning-bg px-3 py-2 text-sm text-warning-fg">
				<FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
				<p>
					<span className="font-medium">{clientName}</span> is a test application. Choose an
					account to sign in as — no password required.
				</p>
			</div>

			{users.length === 0 ? (
				// Not an EmptyState: this is a sign-in card, not a directory surface, and the
				// reader has no CTA available to them — only an admin can fix this.
				<p className="text-sm text-muted-foreground">
					No test users are set up for this application yet. An administrator needs to create
					one and grant it this application&apos;s environment.
				</p>
			) : (
				<ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
					{users.map((user) => {
						const label = user.name ?? user.username;
						const busy = isPending && pendingUserId === user.id;
						return (
							<li key={user.id}>
								<button
									type="button"
									// Any click commits the whole page to a redirect, so a second one
									// while the first is in flight can only cause confusion.
									disabled={isPending}
									onClick={() => signInAs(user.id)}
									className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover disabled:opacity-50"
								>
									{user.avatarUrl ? (
										// An <img> rather than a CSS background-image: the URL is built
										// from a stored key, and interpolating it into a `url("…")`
										// string would make any stray quote a way to point elsewhere.
										// eslint-disable-next-line @next/next/no-img-element -- remote CDN host, not statically known
										<img
											src={user.avatarUrl}
											alt=""
											className="h-10 w-10 shrink-0 rounded-full border border-border bg-surface-sunken object-cover"
											loading="lazy"
											decoding="async"
										/>
									) : (
										<div
											className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-sunken text-xs font-semibold"
											aria-hidden="true"
										>
											{label.slice(0, 2).toUpperCase()}
										</div>
									)}
									<div className="min-w-0 flex-1">
										<div className="truncate font-medium text-foreground">{label}</div>
										<div className="truncate text-xs text-muted-foreground">
											@{user.username}
										</div>
									</div>
									{busy ? (
										<Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
									) : null}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
