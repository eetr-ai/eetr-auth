"use client";

import { useEffect, useState } from "react";
import {
	LayoutDashboard,
	User as UserIcon,
	Loader2,
	Clock,
	Zap,
	CheckCircle,
} from "lucide-react";
import { useAdminState, AdminActionType } from "@/context/admin-state";
import { getCurrentUser } from "@/app/actions/user-actions";
import { getTokenActivityMetrics } from "@/app/actions/token-activity-actions";
import type { Session } from "next-auth";
import type { TokenActivityMetrics } from "@/lib/repositories/token-activity-log.repository";

const SINCE_DAYS = 7;

function formatMs(ms: number | null): string {
	if (ms == null) return "—";
	return `${Math.round(ms)} ms`;
}

export default function AdminDashboardPage() {
	const { state, dispatch } = useAdminState();
	const [user, setUser] = useState<Session["user"] | null>(null);
	const [metrics, setMetrics] = useState<TokenActivityMetrics | null>(null);
	const [metricsError, setMetricsError] = useState<string | null>(null);

	useEffect(() => {
		dispatch({ type: AdminActionType.SET_LOADING, data: true });
		getCurrentUser()
			.then(setUser)
			.finally(() => dispatch({ type: AdminActionType.SET_LOADING, data: false }));
	}, [dispatch]);

	useEffect(() => {
		getTokenActivityMetrics(SINCE_DAYS)
			.then(setMetrics)
			.catch((err) =>
				setMetricsError(err instanceof Error ? err.message : "Failed to load metrics")
			);
	}, []);

	return (
		<main className="min-h-screen p-6 bg-background text-foreground">
			<div className="flex items-center gap-2 text-xl font-semibold">
				<LayoutDashboard className="h-6 w-6" />
				Admin Dashboard
			</div>

			<div className="mt-6 flex flex-col gap-6">
				{state.loading ? (
					<p>Loading...</p>
				) : user ? (
					<div className="flex items-center gap-2">
						<UserIcon className="h-4 w-4" />
						<span>{user.name ?? user.id}</span>
					</div>
				) : (
					<p className="text-muted-foreground">No current user</p>
				)}
			</div>

			{metricsError && (
				<p className="mt-4 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
					{metricsError}
				</p>
			)}

			{metrics && (
				<>
					<section className="mt-8">
						<h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
							<Clock className="h-4 w-4" />
							Latency (last {SINCE_DAYS} days)
						</h2>
						<div className="flex flex-wrap gap-4">
							<div className="min-w-[180px] rounded-xl border border-brand-muted bg-brand-muted/10 px-4 py-3">
								<p className="text-xs text-muted-foreground">Average (overall)</p>
								<p className="text-2xl font-semibold">
									{formatMs(metrics.overallAvgDurationMs)}
								</p>
							</div>
							<div className="min-w-[180px] rounded-xl border border-brand-muted bg-brand-muted/10 px-4 py-3">
								<p className="text-xs text-muted-foreground">Authorize</p>
								<p className="text-2xl font-semibold">
									{formatMs(metrics.avgDurationMsByType.authorize)}
								</p>
							</div>
							<div className="min-w-[180px] rounded-xl border border-brand-muted bg-brand-muted/10 px-4 py-3">
								<p className="text-xs text-muted-foreground">Token exchange</p>
								<p className="text-2xl font-semibold">
									{formatMs(metrics.avgDurationMsByType.token)}
								</p>
							</div>
							<div className="min-w-[180px] rounded-xl border border-brand-muted bg-brand-muted/10 px-4 py-3">
								<p className="text-xs text-muted-foreground">Validate</p>
								<p className="text-2xl font-semibold">
									{formatMs(metrics.avgDurationMsByType.validate)}
								</p>
							</div>
						</div>
					</section>

					<section className="mt-8">
						<h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
							<Zap className="h-4 w-4" />
							By environment
						</h2>
						<div className="overflow-x-auto rounded-xl border border-brand-muted">
							<table className="w-full min-w-[500px] text-left text-sm">
								<thead>
									<tr className="border-b border-brand-muted bg-brand-muted/20">
										<th className="px-4 py-3 font-medium">Environment</th>
										<th className="px-4 py-3 font-medium">Authorize</th>
										<th className="px-4 py-3 font-medium">Token</th>
										<th className="px-4 py-3 font-medium">Validate</th>
										<th className="px-4 py-3 font-medium">Success rate</th>
									</tr>
								</thead>
								<tbody>
									{Object.entries(metrics.byEnvironment).length === 0 ? (
										<tr>
											<td
												colSpan={5}
												className="px-4 py-6 text-center text-muted-foreground"
											>
												No activity in the last {SINCE_DAYS} days.
											</td>
										</tr>
									) : (
										Object.entries(metrics.byEnvironment)
											.sort(([a], [b]) => a.localeCompare(b))
											.map(([env, data]) => (
												<tr
													key={env}
													className="border-b border-brand-muted/50"
												>
													<td className="px-4 py-3 font-medium">
														{env || "(unknown)"}
													</td>
													<td className="px-4 py-3">{data.totalAuth}</td>
													<td className="px-4 py-3">{data.totalToken}</td>
													<td className="px-4 py-3">{data.totalValidate}</td>
													<td className="px-4 py-3">
														{data.totalCount === 0
															? "—"
															: `${Math.round(
																	(100 * data.successCount) / data.totalCount
																)}%`}
													</td>
												</tr>
											))
									)}
								</tbody>
							</table>
						</div>
					</section>

					{metrics.byDay.length > 0 && (
						<section className="mt-8">
							<h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
								<CheckCircle className="h-4 w-4" />
								By day
							</h2>
							<div className="overflow-x-auto rounded-xl border border-brand-muted">
								<table className="w-full min-w-[400px] text-left text-sm">
									<thead>
										<tr className="border-b border-brand-muted bg-brand-muted/20">
											<th className="px-4 py-3 font-medium">Date</th>
											<th className="px-4 py-3 font-medium">Environment</th>
											<th className="px-4 py-3 font-medium">Authorize</th>
											<th className="px-4 py-3 font-medium">Token</th>
											<th className="px-4 py-3 font-medium">Validate</th>
										</tr>
									</thead>
									<tbody>
										{metrics.byDay.flatMap(({ date, byEnvironment }) =>
											Object.entries(byEnvironment).map(([env, counts]) => (
												<tr
													key={`${date}-${env}`}
													className="border-b border-brand-muted/50"
												>
													<td className="px-4 py-2">{date}</td>
													<td className="px-4 py-2">
														{env || "(unknown)"}
													</td>
													<td className="px-4 py-2">{counts.authorize}</td>
													<td className="px-4 py-2">{counts.token}</td>
													<td className="px-4 py-2">{counts.validate}</td>
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>
						</section>
					)}
				</>
			)}
		</main>
	);
}
