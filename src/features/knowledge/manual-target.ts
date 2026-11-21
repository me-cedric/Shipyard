import { useSyncExternalStore } from "react";

/** The page of the manual to show, and the section whose heading to scroll to. `at` makes each ask new. */
export type ManualTarget = { page: string; tab: string | null; at: number };

let target: ManualTarget | null = null;
const listeners = new Set<() => void>();

/** Asks the manual for the help of an address, such as `/code/history`. The caller then opens the manual. */
export function openManualFor(pathname: string) {
	// The guide has one page for each place, with the name of the place: `/flow/list` is `flow.md`, section List.
	const [, place, section] = pathname.split("/");
	target = { page: place || "start", tab: section || null, at: Date.now() };
	for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
	listeners.add(l);
	return () => listeners.delete(l);
};

export const useManualTarget = () => useSyncExternalStore(subscribe, () => target);
