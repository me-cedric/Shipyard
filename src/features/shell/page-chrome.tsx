import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { type Messages, useI18n } from "@/lib/i18n";
import { SPACES, type SpaceId, tabLabel } from "./spaces";

/** The name of the page at a path: its tab, else its space, else the app name. */
export function pageTitle(t: Messages, path: string): string {
	const [, space, tab] = path.split("/");
	if (!space || !(space in SPACES)) return "Shipyard";
	return (tab && tabLabel(t, space as SpaceId, tab)) || t.space[space as SpaceId];
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
	const path = useRouterState({ select: (s) => s.location.pathname });
	const title = pageTitle(t, path);
	useEffect(() => {
		document.title = title === "Shipyard" ? title : `${title} · Shipyard`;
	}, [title]);
	return (
		<div role="status" aria-live="polite" className="sr-only">
			{title}
		</div>
	);
}
