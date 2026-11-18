import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { LibraryBack } from "../library/back-link";
import { StaleBadge, useStalePages } from "../specs/chain-badge";
import { barSections, type PlaceId, sectionPath, viewsOf } from "./places";
import { tabLabel } from "./spaces";

/**
 * The one section switch of a place, under the page (adr:0023 point 1). Library has no switch: its
 * home shows the doors, and each other page shows the back link (`spec:app-redesign#REQ-020`).
 */
export function SectionBar({ place, slug }: { place: PlaceId; slug?: string }) {
	if (place !== "library") return <Switch place={place} slug={slug} />;
	return slug && slug !== "home" ? <LibraryBack /> : null;
}

function Switch({ place, slug }: { place: PlaceId; slug?: string }) {
	const { t } = useI18n();
	const stale = useStalePages();
	const { level } = useRights();
	const views = barSections(place, level);
	return (
		<div className="flex shrink-0 px-4 pt-3">
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
		</div>
	);
}
