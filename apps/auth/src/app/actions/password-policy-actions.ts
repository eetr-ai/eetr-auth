"use server";

import { auth } from "@/auth";
import { onAdminServerAction } from "@/lib/context/on-server-action";
import type {
	CreatePasswordPolicyInput,
	UpdatePasswordPolicyInput,
} from "@/lib/repositories/password-policy.repository";

export async function listPasswordPolicies() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { passwordPolicyService } = getServices();
		return passwordPolicyService.list();
	});
}

export async function createPasswordPolicy(
	input: CreatePasswordPolicyInput,
	environmentIds: string[]
) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { passwordPolicyService } = getServices();
		return passwordPolicyService.create(input, environmentIds, actorUserId);
	});
}

export async function updatePasswordPolicy(
	id: string,
	updates: UpdatePasswordPolicyInput,
	environmentIds: string[]
) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { passwordPolicyService } = getServices();
		return passwordPolicyService.update(id, updates, environmentIds, actorUserId);
	});
}

export async function deletePasswordPolicy(id: string) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { passwordPolicyService } = getServices();
		return passwordPolicyService.delete(id, actorUserId);
	});
}
