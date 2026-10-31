import { useSyncExternalStore } from "react";

/** The page of the manual to show, and the tab whose section to scroll to. `at` makes each ask new. */
export type ManualTarget = { page: string; tab: string | null; at: number };

let target: ManualTarget | null = null;
const listeners = new Set<() => void>();

/** Asks the manual for the help of a route, such as `/code/history`. The caller then opens the manual. */
export function openManualFor(pathname: string) {
	const [, space, tab] = pathname.split("/");
	target = { page: space || "start", tab: tab || null, at: Date.now() };
	for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
	listeners.add(l);
	return () => listeners.delete(l);
};

export const useManualTarget = () => useSyncExternalStore(subscribe, () => target);
