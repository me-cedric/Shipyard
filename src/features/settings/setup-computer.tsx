import { usePermissionSection } from "@/features/onboarding";
import { DebugConsole } from "@/features/projects/debug-console";
import { HealthFeedback } from "@/features/projects/health-feedback";
import { Health } from "@/features/projects/settings-health";
import { useI18n } from "@/lib/i18n";
import {
	ArrowsRightLeftIcon,
	ChatBubbleIcon,
	CpuChipIcon,
	LockClosedIcon,
	PuzzlePieceIcon,
	ShieldCheckIcon,
	SparklesIcon,
} from "@/ui/icons";
import { SectionNav } from "@/ui/molecules/section-nav";
import { SETTINGS_PAGE, Settings } from "@/ui/templates/settings";
import { AgentsRules } from "./agents-rules";
import { Connections } from "./connections";
import { useMcpServers, useProviders } from "./connections/keys";
import { McpOutsideGroup } from "./connections/mcp-outside-group";
import { SetupScope } from "./setup-scope";

/**
 * Setup / This computer (`spec:app-redesign#REQ-024`): what this machine stores. The AI tools, the
 * providers, the MCP servers, the certificates and the permissions, and the doors to the models and
 * rules, the server for outside agents, the health of this computer, and the logs.
 */
export function SetupComputer() {
	const { t } = useI18n();
	const permissions = usePermissionSection();
	// The count of Settings / Connections of before, for what this computer holds: the same queries as the lists.
	const servers = (useMcpServers().data ?? []).filter((m) => m.enabled).length;
	const providers = (useProviders().data ?? []).length;
	const group = t.connections.group;
	// `SectionNav` draws the sections that are on the page.
	const sections = [
		{ id: "connections-runner", label: group.runner, icon: <CpuChipIcon size={14} /> },
		{ id: "connections-provider", label: group.provider, icon: <SparklesIcon size={14} /> },
		{ id: "connections-mcp", label: group.mcp, icon: <PuzzlePieceIcon size={14} /> },
		{ id: "connections-certs", label: t.settings.certs.title, icon: <LockClosedIcon size={14} /> },
		{
			id: `section-${permissions.id}`,
			label: permissions.title,
			icon: <ShieldCheckIcon size={14} />,
		},
	];
	return (
		<SetupScope
			scope="computer"
			count={servers + providers}
			pages={[
				{
					id: "models",
					label: t.tabs.settings["agents-rules"],
					icon: <SparklesIcon size={24} />,
					view: <AgentsRules />,
				},
				{
					id: "share",
					label: t.settings.outside.title,
					icon: <ArrowsRightLeftIcon size={24} />,
					view: (
						<div className={SETTINGS_PAGE}>
							<McpOutsideGroup />
						</div>
					),
					bare: true,
				},
				{
					id: "health",
					label: t.settings.pages.computerHealth,
					icon: <ShieldCheckIcon size={24} />,
					view: <Health scope="computer" />,
				},
				{
					id: "logs",
					label: t.settings.pages.logs,
					icon: <ChatBubbleIcon size={24} />,
					view: (
						<div className={SETTINGS_PAGE}>
							<DebugConsole />
							<HealthFeedback />
						</div>
					),
					bare: true,
				},
			]}
		>
			<SectionNav label={t.ui.sections} items={sections} />
			<Connections scope="computer" />
			<div className={SETTINGS_PAGE}>
				<Settings sections={[{ ...permissions, icon: <ShieldCheckIcon size={14} /> }]} />
			</div>
		</SetupScope>
	);
}
