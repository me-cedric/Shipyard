import { useQuery } from "@tanstack/react-query";
import { Health } from "@/features/projects/settings-health";
import { ProjectSettings } from "@/features/projects/settings-project";
import { TicketsConfigEditor } from "@/features/projects/tickets-config";
import { Automation } from "@/features/sync/automation";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { projectKeys } from "@/lib/projects";
import { Connections } from "./connections";
import { Extensions } from "./extensions";
import { SetupScope } from "./setup-scope";

/**
 * Setup / This project (`spec:app-redesign#REQ-024`): what the project stores and shares with the
 * team. Details (the connections, the project file, what agents may do alone), Automation, Extensions
 * with Plugins and rule packs, Tickets, the connection forms and the health of the project.
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
					linked: true,
					view: <Connections scope="project" />,
				},
				{ id: "automation", label: t.settings.pills.automation, view: <Automation />, bare: true },
				// The tickets file is a part of the project file: no file, no page.
				...(file
					? [
							{
								id: "tickets",
								label: t.doctor.project.tickets,
								linked: true,
								view: <TicketsConfigEditor />,
								bare: true,
							},
						]
					: []),
				{
					id: "extensions",
					label: t.settings.pills.extensions,
					view: <Extensions />,
					bare: true,
				},
				{
					id: "plugins",
					label: t.doctor.ext.packs,
					back: "extensions",
					linked: true,
					view: <Extensions view="plugins" />,
					bare: true,
				},
				{
					id: "health",
					label: t.settings.pages.projectHealth,
					linked: true,
					view: <Health scope="project" />,
					bare: true,
				},
			]}
		>
			<ProjectSettings />
		</SetupScope>
	);
}
