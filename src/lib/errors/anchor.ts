import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { prefersReducedMotion } from "@/ui/motion";

const HIT = "data-anchor-hit";
const WAIT = 5000;
const SHOW = 2000;
const CONTROL = "input, select, textarea, button, a[href], [tabindex]:not([tabindex='-1'])";

/**
 * Arrives at the element that the `#anchor` of the address names: scrolls it into view, moves the
 * focus to its control and rings it for 2 s (`tokens.css`). The ring never moves. Under reduced
 * motion the scroll jumps. Returns true when the element exists.
 */
export function arriveAt(id: string, hold = SHOW): boolean {
	const el = document.getElementById(id);
	if (!el) return false;
	// A closed group would hide the row.
	el.closest("details")?.setAttribute("open", "");
	el.scrollIntoView?.({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
	// The element may be the control itself, or hold it.
	const control = el.matches(CONTROL) ? el : el.querySelector<HTMLElement>(CONTROL);
	(control ?? el).focus({ preventScroll: true });
	el.setAttribute(HIT, "");
	setTimeout(() => el.removeAttribute(HIT), hold);
	return true;
}

/** Runs `arriveAt` for each new address with an anchor. A page that loads late is waited for. */
export function useAnchorArrival() {
	const { hash, key } = useRouterState({
		select: (s) => ({ hash: s.location.hash, key: s.location.state?.__TSR_key }),
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new `key` is a new visit to the same anchor
	useEffect(() => {
		const id = decodeURIComponent(hash.replace(/^#/, ""));
		if (!id || arriveAt(id)) return;
		const watch = new MutationObserver(() => arriveAt(id) && watch.disconnect());
		watch.observe(document.body, { childList: true, subtree: true });
		const stop = setTimeout(() => watch.disconnect(), WAIT);
		return () => {
			watch.disconnect();
			clearTimeout(stop);
		};
	}, [hash, key]);
}
