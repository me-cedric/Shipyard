import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { CloneDialog } from "@/features/projects/clone-dialog";
import { usePicture } from "@/features/settings/picture-field";
import { format, useI18n } from "@/lib/i18n";
import { errorDialog } from "@/lib/ipc";
import { useNotifications } from "@/lib/notifications";
import { usePrefs } from "@/lib/prefs";
import { outcomeError, useActiveProject, useProjectActions, useProjects } from "@/lib/projects";
import { useRights } from "@/lib/rights";
import { Tooltip } from "@/ui/atoms/tooltip";
import { type Place, PlaceMenu } from "@/ui/molecules/place-menu";
import { ProjectSwitcher } from "@/ui/molecules/project-switcher";
import { AccountMenu } from "./account-menu";
import { shortcutText } from "./actions";
import { useLiveSessions } from "./active-sessions";
import { useCounts } from "./counts";
import { PLACE_ICON, type PlaceId, visiblePlaces } from "./places";

/** The count of the shell: Today only (picture 001). */
const COUNT_OF = { today: "needsYou" } as const;

/** The project switch at the top of the rail: the list of the projects and their actions. */
function ProjectSwitch({ compact }: { compact: boolean }) {
	const { t } = useI18n();
	const projects = useProjects().data ?? [];
	const active = useActiveProject().data;
	const { switchTo, openFolder, close, remove } = useProjectActions();
	const navigate = useNavigate();
	const [cloning, setCloning] = useState(false);
	const logo = usePicture("logo").data;
	return (
		<>
			<ProjectSwitcher
				projects={projects}
				value={active?.id ?? null}
				picture={active && logo ? logo : undefined}
				compact={compact}
				onChange={(id) => void switchTo(id)}
				onAll={() => void navigate({ to: "/projects" })}
				onOpen={() =>
					void openFolder().then((o) => {
						const error = o && outcomeError(t, o);
						if (error) void errorDialog(error);
					})
				}
				onClone={() => setCloning(true)}
				onClose={() => void close()}
				onRemove={(p) => void remove(p)}
			/>
			<CloneDialog open={cloning} onClose={() => setCloning(false)} />
		</>
	);
}

/** The rail: the project switch, the places with their counts, then Setup and the account row. */
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
			icon: <Icon size={20} />,
			// The unread news of Today / News: the bell is gone (spec:app-redesign#REQ-008).
			alert:
				id === "today" && unread ? format(t.notifications.unread, { count: unread }) : undefined,
			live: id === "today" && working ? t.shell.activity : undefined,
			count: key && counts[key] ? counts[key] : undefined,
			countYou: id === "today",
			current: at === id,
		};
	});
	const setup = items.at(-1)?.id === "setup" ? items.pop() : undefined;
	return (
		<div className="flex h-full flex-col gap-5 px-3.5 py-5">
			<ProjectSwitch compact={!sidebarOpen} />
			<div className="flex min-h-0 flex-1 flex-col gap-1">
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
				<AccountMenu compact={!sidebarOpen} />
			</div>
		</div>
	);
}
