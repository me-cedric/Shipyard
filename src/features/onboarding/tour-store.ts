import { useSyncExternalStore } from "react";

/** The tour is open. The shell mounts it; the Help menu, the palette and Settings open it again. */
let open = false;
const listeners = new Set<() => void>();
const set = (next: boolean) => {
	open = next;
	for (const l of listeners) l();
};

export const openTour = () => set(true);
export const closeTour = () => set(false);

export function useTourOpen(): boolean {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => open,
	);
}
