import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { PageSwitchContext } from "@/ui/molecules/page-header";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { LibraryBack } from "../library/back-link";
import { StaleBadge, useStalePages } from "../specs/chain-badge";
import { barSections, type PlaceId, sectionPath, viewsOf } from "./places";
import { tabLabel } from "./spaces";

/**
 * The one section switch of a place (adr:0023 point 1). The page header of the page draws it in the
 * title row: it reads `PageSwitchContext` and claims the switch. A page with no page header gets
 * the switch in a row at the right, above the page. Library has no switch: its home shows the
 * doors, and each other page shows the back link (`spec:app-redesign#REQ-020`).
 */
export function SectionBar({
	place,
	slug,
	children,
}: {
	place: PlaceId;
	slug?: string;
	children: ReactNode;
}) {
	// The count of page headers that draw the switch.
	const [claims, setClaims] = useState(0);
	const claim = useCallback(() => {
		setClaims((c) => c + 1);
		return () => setClaims((c) => c - 1);
	}, []);
	const node = useMemo(
		() => (place === "library" ? null : <Switch place={place} slug={slug} />),
		[place, slug],
	);
	// A stable slot: a new `claim` would run the effect of the page header again.
	const slot = useMemo(() => ({ node, claim }), [node, claim]);
	return (
		<PageSwitchContext.Provider value={slot}>
			{place === "library" ? (
				// The manual is help, not a page of Library: no way back to the doors.
				slug && slug !== "home" && slug !== "manual" ? (
					<LibraryBack />
				) : null
			) : claims ? null : (
				<div className="flex shrink-0 justify-end pb-3">{node}</div>
			)}
			{children}
		</PageSwitchContext.Provider>
	);
}

function Switch({ place, slug }: { place: PlaceId; slug?: string }) {
	const { t } = useI18n();
	const stale = useStalePages();
	const { level } = useRights();
	const views = barSections(place, level);
	return (
		<SectionSwitch
			label={t.nav.tabs}
			items={views.map(([space, tab]) => ({
				id: tab,
				label: tabLabel(t, space, tab),
				current: tab === slug,
			}))}
			renderItem={(item, props) => {
				const view = views.find(([, tab]) => tab === item.id);
				return (
					// A pointer that rests on a section loads its code before the click.
					<Link to={sectionPath(place, item.id)} preload="intent" {...props}>
						{item.label}
						{view && viewsOf(...view).some((v) => stale.has(v)) ? <StaleBadge /> : null}
					</Link>
				);
			}}
		/>
	);
}
