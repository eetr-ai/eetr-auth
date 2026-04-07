"use server";

import { onServerAction } from "@/lib/context/on-server-action";

export async function listEnvironments() {
	return onServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.list();
	});
}

export async function createEnvironment(name: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.create(name);
	});
}

export async function updateEnvironment(id: string, name: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.update(id, name);
	});
}

export async function deleteEnvironment(id: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { environmentService } = getServices();
		return environmentService.delete(id);
	});
}
