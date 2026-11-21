import { Link } from "@tanstack/react-router";
import {
	firstPath,
	PLACE_IDS,
	type PlaceId,
	sectionView,
	visiblePlaces,
} from "@/features/shell/places";
import { tabLabel } from "@/features/shell/spaces";
import { format, useI18n } from "@/lib/i18n";
import type { Level, TeamRole } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { type Area, useRights } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { buttonVariants } from "@/ui/atoms/button";
import { PageHeader } from "@/ui/molecules/page-header";
import { NoSwitch } from "./no-switch";

/** The order of the cards (picture 066). */
const ORDER: TeamRole[] = [
	"po",
	"pm",
	"ba",
	"architect",
	"techlead",
	"developer",
	"qa",
	"designer",
	"viewer",
];

/** Setup is the same for each role: the cards show the six places of the work (picture 066). */
const SHOWN = PLACE_IDS.filter((p) => p !== "setup");

/**
 * Role views (picture 066): one card for each role with the page that the role starts on and the
 * places that it sees. A place that the role does not see is struck through. The levels come from
 * the rights of the project (`rightsGet`), the first page from `firstPath`.
 */
export function RoleViews() {
	const { t } = useI18n();
	const { teamRole } = usePrefs();
	const rights = useRights().view?.roles ?? [];
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
			<NoSwitch>
				<PageHeader
					title={t.home.roles.title}
					action={
						<Link to="/crew/rights" className={cn(buttonVariants(), "min-h-control")}>
							{t.rights.team.matrix}
						</Link>
					}
				/>
			</NoSwitch>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4 px-4">
				{ORDER.map((role) => {
					const access = rights.find((r) => r.role === role)?.access;
					// With no rights of the project (a solo person), each role sees each place.
					const level = Object.assign((area: Area): Level => access?.[area] ?? "write", {
						hidden: rights.find((r) => r.role === role)?.hidden ?? [],
					});
					const seen = visiblePlaces(level);
					const first = firstPath(role, level);
					const [, place, slug] = first.split("/") as [string, PlaceId, string];
					const view = sectionView(place, slug);
					const section = view ? tabLabel(t, ...view) : "";
					// The section shows only when it differs from the place ("Flow", not "Flow, Flow").
					const page =
						section && section !== t.ui.place[place]
							? `${t.ui.place[place]}, ${section}`
							: t.ui.place[place];
					const name = role === "viewer" ? t.home.roles.viewer : t.rights.role[role];
					return (
						<section
							key={role}
							aria-labelledby={`role-${role}`}
							className={cn(
								"flex flex-col gap-3.5 rounded-lg bg-surface-2 p-5 shadow-2",
								role === teamRole && "outline-2 outline-accent",
							)}
						>
							<div className="flex items-center gap-2.5">
								<h2 id={`role-${role}`} className="mr-auto text-20 font-semibold text-n-12">
									{name}
								</h2>
								{role === teamRole ? <Badge variant="accent">{t.home.roles.mine}</Badge> : null}
							</div>
							<Link
								to={first}
								className="flex min-h-control items-center rounded-field bg-accent-tint px-3.5 font-semibold text-accent-text"
							>
								{format(t.home.roles.startsOn, { page })}
							</Link>
							<ul className="flex flex-wrap gap-1.5">
								{SHOWN.map((p) =>
									seen.includes(p) ? (
										<li
											key={p}
											className="inline-flex h-7 items-center rounded-sm bg-n-3 px-2.5 text-13 font-semibold text-n-12"
										>
											{t.ui.place[p]}
										</li>
									) : (
										<li
											key={p}
											className="inline-flex h-7 items-center rounded-sm border border-dashed border-n-8 px-2.5 text-13 font-semibold text-n-11"
										>
											<span aria-hidden="true" className="line-through">
												{t.ui.place[p]}
											</span>
											<span className="sr-only">
												{format(t.home.roles.hidden, { place: t.ui.place[p] })}
											</span>
										</li>
									),
								)}
							</ul>
						</section>
					);
				})}
			</div>
		</div>
	);
}
