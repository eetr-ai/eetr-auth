"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";

export enum AdminActionType {
	SET_SIDEBAR_OPEN = "SET_SIDEBAR_OPEN",
	SET_LOADING = "SET_LOADING",
}

export interface AdminState {
	sidebarOpen: boolean;
	loading: boolean;
}

const initialState: AdminState = {
	sidebarOpen: true,
	loading: false,
};

function reducer(
	state: AdminState = initialState,
	action: ReducerAction<AdminActionType>
): AdminState {
	switch (action.type) {
		case AdminActionType.SET_SIDEBAR_OPEN:
			return { ...state, sidebarOpen: action.data ?? !state.sidebarOpen };
		case AdminActionType.SET_LOADING:
			return { ...state, loading: action.data ?? false };
		default:
			return state;
	}
}

const { Provider, useContextAccessors } = bootstrapProvider<
	AdminState,
	ReducerAction<AdminActionType>
>(reducer, initialState);

export { Provider as AdminProvider, useContextAccessors as useAdminState };
