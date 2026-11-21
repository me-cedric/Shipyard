import { useSyncExternalStore } from "react";

/**
 * Later hides the card of the missing permissions until the app starts again. A browser build made
 * with `VITE_PERMISSIONS_LATER=1` (the e2e and persona runs) starts hidden: those runs drive the
 * page and a modal would block them.
 */
let later = import.meta.env.VITE_PERMISSIONS_LATER === "1";
const listeners = new Set<() => void>();
const set = (next: boolean) => {
	later = next;
	for (const l of listeners) l();
};
export const laterPermissions = () => set(true);
export const resetPermissionsLater = () => set(false);
export const usePermissionsLater = () =>
	useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => later,
	);
