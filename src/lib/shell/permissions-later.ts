import { useSyncExternalStore } from "react";

/** Later hides the card of the missing permissions until the app starts again. */
let later = false;
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
