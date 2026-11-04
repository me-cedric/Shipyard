import { useState } from "react";
import { usePrefs } from "./prefs";

/**
 * The size of a resizable panel, kept per person under `key`. A drag shows its size at once and
 * saves it when the drag ends. `reset` goes back to `fallback`. Feed it to the `Splitter`.
 */
export function usePanelSize(key: string, fallback: number) {
	const { panelSizes, setPrefs } = usePrefs();
	const [drag, setDrag] = useState<number | null>(null);
	const saved = panelSizes[key] ?? fallback;
	return {
		size: drag ?? saved,
		set: (size: number, persist: boolean) => {
			setDrag(persist ? null : size);
			if (persist && size !== saved) setPrefs({ panelSizes: { ...panelSizes, [key]: size } });
		},
		reset: () => {
			setDrag(null);
			const { [key]: _gone, ...rest } = panelSizes;
			setPrefs({ panelSizes: rest });
		},
	};
}
