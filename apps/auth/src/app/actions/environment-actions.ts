"use server";

import { auth } from "@/auth";
import { onAdminServerAction } from "@/lib/context/on-server-action";

export async function listEnvironments() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.list();
	});
}

export async function createEnvironment(name: string) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.create(name, actorUserId);
	});
}

export async function updateEnvironment(id: string, name: string) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.update(id, name, actorUserId);
	});
}

export async function deleteEnvironment(id: string) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.delete(id, actorUserId);
	});
}
