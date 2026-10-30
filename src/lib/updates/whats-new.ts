import { useSyncExternalStore } from "react";

/**
 * The version that runs and the changelog sections of the last update. The update check fills it. The status bar shows the version and opens the
 * dialog; the dialog also opens by itself once after an update.
 */
type State = { current: string; notes: string; open: boolean };

let state: State = { current: "", notes: "", open: false };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
	state = { ...state, ...next };
	for (const l of listeners) l();
};

export const setVersion = (current: string) => set({ current });
/** After an update: keep the notes and open the dialog. */
export const showNotes = (current: string, notes: string) => set({ current, notes, open: true });
export const openWhatsNew = () => set({ open: true });
/** The shell left: forget the version and the notes. */
export const resetWhatsNew = () => set({ current: "", notes: "", open: false });
export const closeWhatsNew = () => set({ open: false });

export function useWhatsNew(): State {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => state,
	);
}
