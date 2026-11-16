import { Link, useRouterState } from "@tanstack/react-router";
import { format, useI18n } from "@/lib/i18n";
import { useNotifications } from "@/lib/notifications";
import { usePrefs } from "@/lib/prefs";
import { useRights } from "@/lib/rights";
import { Tooltip } from "@/ui/atoms/tooltip";
import { type Place, PlaceMenu } from "@/ui/molecules/place-menu";
import logo from "../../../docs/assets/logo.svg";
import { shortcutText } from "./actions";
import { useLiveSessions } from "./active-sessions";
import { useCounts } from "./counts";
import { PLACE_ICON, type PlaceId, visiblePlaces } from "./places";

/** The counts of the shell, on the place that shows them. */
const COUNT_OF = { today: "needsYou", flow: "live", code: "changed" } as const;

export function Sidebar() {
	const { t } = useI18n();
	const { sidebarOpen } = usePrefs();
	const counts = useCounts();
	const { unread } = useNotifications();
	const sessions = useLiveSessions();
	const working = counts.live > 0 || sessions.some((s) => s.state === "working");
	const { level } = useRights();
	const at = useRouterState({ select: (s) => s.location.pathname.split("/")[1] });
	const places = visiblePlaces(level);
	const items: Place[] = places.map((id) => {
		const Icon = PLACE_ICON[id];
		const key = COUNT_OF[id as keyof typeof COUNT_OF];
		return {
			id,
			label: t.ui.place[id],
			icon: <Icon size={16} />,
			// The unread news of Today / News: the bell is gone (spec:app-redesign#REQ-008).
			alert:
				id === "today" && unread ? format(t.notifications.unread, { count: unread }) : undefined,
			live: id === "today" && working ? t.shell.activity : undefined,
			count: key && counts[key] ? counts[key] : undefined,
			current: at === id,
		};
	});
	const setup = items.at(-1)?.id === "setup" ? items.pop() : undefined;
	return (
		<div className="flex h-full flex-col gap-1 p-2">
			<div className="flex h-8 items-center px-1.5">
				<img src={logo} alt="Shipyard" className="size-6 shrink-0" />
			</div>
			<PlaceMenu
				items={items}
				end={setup}
				narrow={!sidebarOpen}
				renderLink={(place, props) => {
					const link = <Link to={`/${place.id as PlaceId}`} {...props} />;
					return sidebarOpen ? (
						link
					) : (
						<Tooltip
							label={place.label}
							shortcut={shortcutText(String(places.indexOf(place.id as PlaceId) + 1))}
						>
							{link}
						</Tooltip>
					);
				}}
			/>
		</div>
	);
}
