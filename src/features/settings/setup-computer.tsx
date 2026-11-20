import { useRouter, useRouterState } from "@tanstack/react-router";
import { useContext, useMemo } from "react";
import { PermissionsCard, ReplayTour } from "@/features/onboarding";
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
import { McpOutsideGroup } from "./connections/mcp-outside-group";
import { Compass } from "./extensions/compass";
import { Column, Columns, SetupCard, SetupPills } from "./parts";
import { SetupScope } from "./setup-scope";

const HEALTH = "/setup/computer?page=health";

/**
 * Logs and feedback: the console, the findings over time and the personas for prices at the left,
 * what the system allows and the feedback at the right.
 */
export function Logs() {
	const { t } = useI18n();
	const pills = t.settings.pills;
	const at = (page?: string) => (page ? `/setup/computer?page=${page}` : "/setup/computer");
	return (
		<>
			<SetupPills
				label={t.settings.scope.computer}
				items={[
					{ id: "connections", label: pills.connections, href: at() },
					{ id: "models", label: pills.models, href: at("models") },
					{ id: "health", label: pills.health, href: at("health"), current: true },
				]}
			/>
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
			<div className="-mt-6 px-4 pb-10">
				<SetupCard title={t.ui.more}>
					<ReplayTour />
				</SetupCard>
			</div>
		</>
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
						label: t.settings.pills.health,
						view: (row) => <Health scope="computer" below={row} />,
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
