import { useCallback, useState } from "react";
import { clearViewState, readView, useViewProject, viewProjectNow, writeView } from "./view-state";

// The choice of each view for the session, by project and scope. A remount of the view reads it
// back. The choice is also saved per project, so it survives a restart.
const memory = new Map<string, string | null>();
const mk = (id: string, scope: string) => `${id}\0${scope}`;

/**
 * The open item of a list-detail view, kept per view while the app runs. With `ids`, the view never
 * shows an empty detail: no choice, or a choice that left the list, gives the first item. Without
 * `ids` (a card overview that opens one item), no choice is the overview.
 */
export function useTabSelection(
	scope: string,
	ids?: readonly string[],
): [string | null, (id: string | null) => void] {
	// The memory is the state; the counter only draws the view again after a choice.
	const [, redraw] = useState(0);
	const project = useViewProject();
	const k = mk(project, scope);
	const chosen = memory.has(k)
		? (memory.get(k) ?? null)
		: readView<string | null>(project, `tab:${scope}`, null);
	const select = useCallback(
		(id: string | null) => {
			memory.set(k, id);
			writeView(project, `tab:${scope}`, id);
			redraw((n) => n + 1);
		},
		[k, project, scope],
	);
	if (!ids) return [chosen, select];
	return [chosen !== null && ids.includes(chosen) ? chosen : (ids[0] ?? null), select];
}

/** Sets the choice of a view before it mounts, such as a file to show in Code / Changes. */
export const rememberSelection = (scope: string, id: string) =>
	memory.set(mk(viewProjectNow(), scope), id);

// The files that an Edit action asked to open in their editor. The page reads it, then clears it.
const edits = new Set<string>();
export const requestEdit = (id: string) => edits.add(id);
export const wantsEdit = (id: string) => edits.has(id);
export const clearEditRequest = (id: string) => edits.delete(id);

/** Forgets every choice. For tests. */
export const clearTabSelections = () => {
	memory.clear();
	edits.clear();
	clearViewState();
};
