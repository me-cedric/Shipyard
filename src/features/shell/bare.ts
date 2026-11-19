import { createContext, useContext, useLayoutEffect } from "react";
import { PageSwitchContext } from "@/ui/molecules/page-header";

/** The claim of the bare frame. The shell provides it; without a shell the claim does nothing. */
export const BareContext = createContext<() => () => void>(() => () => {});

/**
 * A page that shows without the shell (the first run, no project is open) calls this hook. While
 * the page shows, the shell draws no rail and no top row, and the place draws no section switch.
 */
export function useBare() {
	const claim = useContext(BareContext);
	const page = useContext(PageSwitchContext);
	useLayoutEffect(() => {
		const free = claim();
		const freeSwitch = page?.claim();
		return () => {
			free();
			freeSwitch?.();
		};
	}, [claim, page]);
}

/** The app mark of a bare page. */
export const MARK = "size-14 shrink-0 rounded-lg bg-accent";
