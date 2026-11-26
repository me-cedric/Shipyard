import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type Messages, useI18n } from "@/lib/i18n";
import { PLACES, type PlaceId, sectionView } from "./places";
import { tabLabel } from "./spaces";

/** The name of the page at a path: its section, else its place, else the app name. */
export function pageTitle(t: Messages, path: string): string {
	const [, place, slug] = path.split("/");
	// Projects and Impacts are pages off the section switches.
	if (place === "projects") return t.tabs.home.projects;
	if (place === "flow" && slug === "impacts") return t.tabs.code.impacts;
	if (!place || !(place in PLACES)) return "Shipyard";
	const view = slug ? sectionView(place as PlaceId, slug) : undefined;
	return (view && tabLabel(t, ...view)) || t.ui.place[place as PlaceId];
}

/** A link that is first in the tab order and moves the focus to the main content. */
export function SkipLink() {
	const { t } = useI18n();
	return (
		<button
			type="button"
			onClick={() => document.querySelector<HTMLElement>("main")?.focus()}
			className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:bg-surface-3 focus:px-3 focus:py-1.5 focus:text-ui"
		>
			{t.workspace.view.skip}
		</button>
	);
}

/** The window title follows the page, and a polite live region announces each change of page. */
export function RouteAnnouncer() {
	const { t } = useI18n();
	const path = useRouterState({
		select: (s) => (s.resolvedLocation ?? s.location).pathname,
	});
	const search = useRouterState({
		select: (s) => (s.resolvedLocation ?? s.location).searchStr,
	});
	const section = pageTitle(t, path);
	const [h1, setH1] = useState("");
	const [said, setSaid] = useState("");
	const name = (h: string) => (h && h !== section ? `${h} · ${section}` : section);
	// The page names itself in its h1: read it once the page has drawn. The title follows the h1 until
	// it is known. Only a move says the name aloud: a changed count in the h1 is not a new page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: read again at each move, also one that changes only the search
	useEffect(() => {
		setH1("");
		const read = () => document.querySelector("main h1")?.textContent?.trim() ?? "";
		const id = window.setTimeout(() => {
			const first = read();
			setH1(first);
			setSaid(name(first));
		}, 0);
		// An h1 can appear after its query loads: the title takes it, and the watch stops at the first one.
		const main = document.querySelector("main");
		const watch = main
			? new MutationObserver(() => {
					const next = read();
					if (!next) return;
					setH1(next);
					watch?.disconnect();
				})
			: null;
		watch?.observe(main as Element, { childList: true, subtree: true, characterData: true });
		return () => {
			window.clearTimeout(id);
			watch?.disconnect();
		};
	}, [path, search]);
	const title = name(h1);
	useEffect(() => {
		document.title = title === "Shipyard" ? title : `${title} · Shipyard`;
	}, [title]);
	return (
		<div role="status" aria-live="polite" className="sr-only">
			{said}
		</div>
	);
}
