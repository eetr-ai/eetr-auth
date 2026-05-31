"use server";

import { onAdminServerAction } from "@/lib/context/on-server-action";

export async function listEnvironments() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.list();
	});
}

export async function createEnvironment(name: string) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.create(name);
	});
}

export async function updateEnvironment(id: string, name: string) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.update(id, name);
	});
}

export async function deleteEnvironment(id: string) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.delete(id);
	});
}
