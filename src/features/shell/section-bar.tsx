import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { StaleBadge, useStalePages } from "../specs/chain-badge";
import { barSections, type PlaceId, sectionPath } from "./places";
import { tabLabel } from "./spaces";

/** The one section switch of a place, under the page (adr:0023 point 1). */
export function SectionBar({ place, slug }: { place: PlaceId; slug?: string }) {
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
							{view && stale.has(view.join("/")) ? <StaleBadge /> : null}
						</Link>
					);
				}}
			/>
		</div>
	);
}
