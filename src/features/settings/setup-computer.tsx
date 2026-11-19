import { useRouter, useRouterState } from "@tanstack/react-router";
import { useContext, useMemo } from "react";
import { PermissionsCard } from "@/features/onboarding";
import { DebugConsole } from "@/features/projects/debug-console";
import { FindingsOverTime } from "@/features/projects/doctor-ledger";
import { HealthFeedback } from "@/features/projects/health-feedback";
import { Health } from "@/features/projects/settings-health";
import { PersonasCard } from "@/features/projects/settings-project";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { PageSwitchContext } from "@/ui/molecules/page-header";
import { AgentsRules } from "./agents-rules";
import { Connections } from "./connections";
import { useMcpServers, useProviders } from "./connections/keys";
import { McpOutsideGroup } from "./connections/mcp-outside-group";
import { Compass } from "./extensions/compass";
import { Column, Columns } from "./parts";
import { SetupScope } from "./setup-scope";

const HEALTH = "/setup/computer?page=health";

/**
 * Logs and feedback: the console, the findings over time and the personas for prices at the left,
 * what the system allows and the feedback at the right.
 */
export function Logs() {
	return (
		<Columns>
			<Column>
				<DebugConsole />
				<FindingsOverTime />
				<PersonasCard />
			</Column>
			<Column>
				<PermissionsCard />
				<HealthFeedback />
			</Column>
		</Columns>
	);
}

/**
 * Setup / This computer (`spec:app-redesign#REQ-024`): what this machine stores. The AI tools, the
 * providers, the MCP servers, the outside agents and the security, and the pages of the models and
 * rules, the share with other tools, the health of this computer, and the logs.
 */
export function SetupComputer() {
	const { t } = useI18n();
	const p = t.personal.setup;
	const router = useRouter();
	const first = useRouterState({
		select: (s) => !new URLSearchParams(s.location.searchStr).get("page"),
	});
	// The count of Settings / Connections of before, for what this computer holds: the same queries as the lists.
	const servers = (useMcpServers().data ?? []).filter((m) => m.enabled).length;
	const providers = (useProviders().data ?? []).length;
	// Repair sits at the right of the section switch, on the first page: the title row draws this slot.
	const slot = useContext(PageSwitchContext);
	const withRepair = useMemo(
		() => ({
			claim: slot?.claim ?? (() => () => {}),
			node: (
				<>
					{slot?.node}
					<Button variant="secondary" onClick={() => router.history.push(HEALTH)}>
						{p.repair}
					</Button>
				</>
			),
		}),
		[slot, router, p.repair],
	);
	return (
		<PageSwitchContext.Provider value={first ? withRepair : slot}>
			<SetupScope
				scope="computer"
				count={servers + providers}
				pages={[
					{ id: "models", label: t.settings.pills.models, view: <AgentsRules />, bare: true },
					{
						id: "rules",
						label: p.rulesText,
						back: "models",
						linked: true,
						view: <Compass>{null}</Compass>,
					},
					{
						id: "share",
						label: p.share,
						linked: true,
						view: <McpOutsideGroup />,
						bare: true,
					},
					{
						id: "health",
						label: t.settings.pages.computerHealth,
						view: <Health scope="computer" />,
					},
					{
						id: "logs",
						label: t.settings.pages.logs,
						back: "health",
						linked: true,
						view: <Logs />,
						bare: true,
					},
				]}
			>
				<Connections scope="computer" />
			</SetupScope>
		</PageSwitchContext.Provider>
	);
}
