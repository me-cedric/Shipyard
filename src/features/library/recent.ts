import { readView, useViewState, viewProjectNow, writeView } from "@/lib/shell/view-state";

const PINS = "library/pins";
const RECENT = "library/recent";
/** The most pages kept in "Opened last". */
const RECENT_CAP = 5;

/** Notes that the person opened a page of Library. Kept per project on this machine. */
export function noteOpened(slug: string) {
	const id = viewProjectNow();
	const before = readView<string[]>(id, RECENT, []);
	if (before[0] === slug) return;
	writeView(id, RECENT, [slug, ...before.filter((s) => s !== slug)].slice(0, RECENT_CAP));
}

/** The pages of Library that the person opened last, the newest first. */
export const useLibraryRecent = () => useViewState<string[]>(RECENT, [])[0];

/** The pages of Library that the person pinned, and the switch of one pin. */
export function useLibraryPins() {
	const [pins, setPins] = useViewState<string[]>(PINS, []);
	const toggle = (slug: string) =>
		setPins(pins.includes(slug) ? pins.filter((s) => s !== slug) : [...pins, slug]);
	return { pins, toggle };
}
