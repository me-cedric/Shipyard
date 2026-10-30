import { useCallback, useState } from "react";

// The choice of each view for the session, by scope. A remount of the view reads it back.
const memory = new Map<string, string | null>();

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
	const chosen = memory.get(scope) ?? null;
	const select = useCallback(
		(id: string | null) => {
			memory.set(scope, id);
			redraw((n) => n + 1);
		},
		[scope],
	);
	if (!ids) return [chosen, select];
	return [chosen !== null && ids.includes(chosen) ? chosen : (ids[0] ?? null), select];
}

/** Sets the choice of a view before it mounts, such as a file to show in Code / Changes. */
export const rememberSelection = (scope: string, id: string) => memory.set(scope, id);

/** Forgets every choice. For tests. */
export const clearTabSelections = () => memory.clear();
