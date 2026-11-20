import { useSyncExternalStore } from "react";

// shortcut: like the pins of tiles, the pinned dashboards live in the webview storage of this
// machine; upgrade when the preferences hold a list (Q-070).
const KEY = "shipyard.pinned-dashboards";
const listeners = new Set<() => void>();

const read = (): string => {
	try {
		return localStorage.getItem(KEY) ?? "[]";
	} catch {
		return "[]";
	}
};

/** The dashboards that the person pinned to Today (`spec:library-functions#REQ-009`): one card each. A per-person setting. */
export function usePinnedDashboards() {
	const raw = useSyncExternalStore((l) => {
		listeners.add(l);
		return () => listeners.delete(l);
	}, read);
	let slugs: string[] = [];
	try {
		slugs = JSON.parse(raw) as string[];
	} catch {
		// A broken value shows no card.
	}
	return {
		slugs,
		pinned: (slug: string) => slugs.includes(slug),
		toggle: (slug: string) => {
			const next = slugs.includes(slug) ? slugs.filter((s) => s !== slug) : [...slugs, slug];
			try {
				localStorage.setItem(KEY, JSON.stringify(next));
			} catch {
				// A full or blocked storage keeps the pin for this visit only.
			}
			for (const l of listeners) l();
		},
	};
}
