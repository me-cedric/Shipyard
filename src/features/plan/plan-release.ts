import { useState } from "react";

const key = (slug: string) => `shipyard.plan-release.${slug}`;

/**
 * The release that the plan of a sheet is for (`code-host-tickets` REQ-011). A per-person choice
 * kept in this browser: it needs no file of the project.
 *
 * shortcut: nothing else reads it yet. Store it in the plan decisions when the title of Timeline
 * or the costing must follow it.
 */
export function usePlanRelease(slug: string) {
	const [release, setRelease] = useState(() => {
		try {
			return localStorage.getItem(key(slug)) ?? "";
		} catch {
			return "";
		}
	});
	return [
		release,
		(next: string) => {
			setRelease(next);
			try {
				if (next) localStorage.setItem(key(slug), next);
				else localStorage.removeItem(key(slug));
			} catch {
				// Blocked storage: the choice lasts until the page closes.
			}
		},
	] as const;
}
