import { useQuery } from "@tanstack/react-query";
import { Health } from "@/features/projects/settings-health";
import { ProjectSettings, sectionItems } from "@/features/projects/settings-project";
import { TicketsConfigEditor } from "@/features/projects/tickets-config";
import { Automation } from "@/features/sync/automation";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { projectKeys } from "@/lib/projects";
import { LinkIcon, PuzzlePieceIcon, QueueListIcon, ShieldCheckIcon } from "@/ui/icons";
import { SectionNav } from "@/ui/molecules/section-nav";
import { SETTINGS_PAGE } from "@/ui/templates/settings";
import { Connections } from "./connections";
import { Extensions } from "./extensions";
import { SetupScope } from "./setup-scope";

/**
 * Setup / This project (`spec:app-redesign#REQ-024`): what the project stores and shares with the
 * team. The project file and the automation, and the doors to the connections of the issue tracker
 * and the code host, the tickets, the extensions and the health of the project.
 */
export function SetupProject() {
	const { t } = useI18n();
	// The same query as the project form: one cache.
	const file = useQuery({
		queryKey: projectKeys.settings,
		queryFn: () => unwrap(commands.projectSettings()),
	}).data?.file;
	return (
		<SetupScope
			scope="project"
			pages={[
				{
					id: "connections",
					label: t.tabs.settings.connections,
					icon: <LinkIcon size={24} />,
					view: <Connections scope="project" />,
				},
				// The tickets file is a part of the project file: no file, no door.
				...(file
					? [
							{
								id: "tickets",
								label: t.projects.ticketsConfig.title,
								icon: <QueueListIcon size={24} />,
								view: (
									<div className={SETTINGS_PAGE}>
										<TicketsConfigEditor />
									</div>
								),
								bare: true,
							},
						]
					: []),
				{
					id: "extensions",
					label: t.tabs.settings.extensions,
					icon: <PuzzlePieceIcon size={24} />,
					view: <Extensions />,
				},
				{
					id: "health",
					label: t.settings.pages.projectHealth,
					icon: <ShieldCheckIcon size={24} />,
					view: <Health scope="project" />,
				},
			]}
		>
			<SectionNav label={t.ui.sections} items={sectionItems(t, !!file)} />
			<ProjectSettings scope />
			<Automation />
		</SetupScope>
	);
}
