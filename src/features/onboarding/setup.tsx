import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { connectionKeys, runnerKeys } from "@/features/settings/connections/keys";
import { DefaultAgentSelect } from "@/features/settings/me/personal";
import type { TabPath } from "@/features/shell";
import { useGuard } from "@/features/work/guard";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { askForm } from "@/lib/shell";
import { useTeam, useWorkActions } from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import {
	CheckIcon,
	CodeBracketIcon,
	CpuChipIcon,
	FolderOpenIcon,
	InboxIcon,
	ShieldCheckIcon,
	SparklesIcon,
	UsersIcon,
} from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";
import type { SettingsSection } from "@/ui/templates/settings";
import { usePermissions } from "./permissions";
import { closeTour } from "./tour-store";

/** The settings that a person must make to use the app, in the order of need. */
export const SETUP = [
	"project",
	"ai",
	"models",
	"tracker",
	"forge",
	"permissions",
	"team",
] as const;
export type SetupId = (typeof SETUP)[number];

const ICON: Record<SetupId, ReactNode> = {
	project: <FolderOpenIcon size={14} />,
	ai: <CpuChipIcon size={14} />,
	models: <CpuChipIcon size={14} />,
	tracker: <InboxIcon size={14} />,
	forge: <CodeBracketIcon size={14} />,
	permissions: <ShieldCheckIcon size={14} />,
	team: <UsersIcon size={14} />,
};

/** The live state of each item, from the caches of Settings. `undefined`: not known yet. */
export function useSetup(): Record<SetupId, boolean | undefined> {
	const project = useActiveProject().data;
	const { defaultAgent, loaded } = usePrefs();
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	}).data;
	const tiers = useQuery({ queryKey: ["tiers"], queryFn: () => unwrap(commands.tiersGet()) }).data;
	const connections = useQuery({
		queryKey: connectionKeys.list,
		queryFn: () => unwrap(commands.connectionsList()),
	}).data;
	const permissions = usePermissions().data;
	const team = useTeam().data;
	const tool = defaultAgent || runners?.find((r) => r.state === "detected")?.id;
	const row = tiers?.find((r) => r.runner === tool);
	return {
		project: project === undefined ? undefined : project !== null,
		ai: loaded ? defaultAgent !== "" : undefined,
		models: tiers && runners ? [row?.top, row?.mid, row?.small].some(Boolean) : undefined,
		tracker: connections?.some((c) => c.group === "tracker"),
		forge: connections?.some((c) => c.group === "forge"),
		permissions: permissions?.every((p) => p.state !== "notAsked" && p.state !== "off"),
		team: team?.team.members.some((m) => m.admin),
	};
}

/** The person adds themselves as the admin of the team file (REQ-012). */
function AddMe() {
	const { t } = useI18n();
	const act = useWorkActions();
	const { failure, busy, run } = useGuard();
	const add = () =>
		run(async () => {
			const view = await act.addMe();
			const { me } = await unwrap(commands.workContext(-new Date().getTimezoneOffset()));
			await act.saveTeam({
				members: view.team.members.map((m) => (m.handle === me ? { ...m, admin: true } : m)),
			});
		});
	return (
		<>
			<RightButton
				right="project.settings"
				variant="primary"
				busy={busy}
				onClick={() => void add()}
			>
				{t.onboarding.setup.action.team}
			</RightButton>
			<ErrorNotice error={failure} className="text-ui text-danger-text" />
		</>
	);
}

/** The state of one item and its one action: in place for a single control, else the section. */
export function SetupControl({
	id,
	done,
	pick = true,
}: {
	id: SetupId;
	done: boolean | undefined;
	/** Show the AI tool select. Settings / Me has it on the page already. */
	pick?: boolean;
}) {
	const { t } = useI18n();
	const s = t.onboarding.setup;
	const navigate = useNavigate();
	const go = (to: TabPath, hash?: string, form?: string) => () => {
		if (form) askForm(form);
		closeTour();
		void navigate({ to, hash });
	};
	const open = (label: string, onClick: () => void, variant?: "primary") => (
		<Button variant={variant} onClick={onClick}>
			{label}
		</Button>
	);
	const todo = done === false;
	return (
		<>
			{done === undefined ? null : (
				<span
					className={`flex items-center gap-1.5 text-ui ${done ? "text-success-text" : "text-n-11"}`}
				>
					<span aria-hidden="true" className="flex">
						{done ? <CheckIcon size={14} /> : <StatusDot status="warning" />}
					</span>
					{done ? s.done : s.todo}
				</span>
			)}
			{id === "ai" && pick ? <DefaultAgentSelect /> : null}
			{todo && id === "project"
				? open(s.action.project, go("/home/projects", undefined, "project"), "primary")
				: null}
			{todo && id === "ai" ? open(s.action.signIn, go("/settings/agents-rules", "tools")) : null}
			{todo && id === "models"
				? open(s.action.models, go("/settings/agents-rules", "tiers"), "primary")
				: null}
			{todo && id === "tracker"
				? open(s.action.connect, go("/settings/connections", undefined, "connection"), "primary")
				: null}
			{todo && id === "forge"
				? open(
						s.action.connect,
						go("/settings/connections", undefined, "connection:forge"),
						"primary",
					)
				: null}
			{todo && id === "permissions"
				? open(s.action.permissions, go("/settings/me", "section-permissions"))
				: null}
			{todo && id === "team" ? <AddMe /> : null}
		</>
	);
}

/** The items `ids` as settings rows: the tour step and the Setup card. */
export function SetupList({ ids }: { ids: readonly SetupId[] }) {
	const { t } = useI18n();
	const state = useSetup();
	return (
		<ul aria-label={t.onboarding.setup.title} className="rounded-lg border bg-surface-2">
			{ids.map((id) => (
				<li key={id}>
					<SettingsRow icon={ICON[id]} label={t.onboarding.setup.item[id]}>
						<SetupControl id={id} done={state[id]} />
					</SettingsRow>
				</li>
			))}
		</ul>
	);
}

/** Home / Today: the items to do, in one card. It goes away when none is to do (REQ-013). */
export function SetupCard() {
	const { t } = useI18n();
	const state = useSetup();
	const todo = SETUP.filter((id) => state[id] === false);
	if (todo.length === 0) return null;
	return (
		<Panel
			title={t.onboarding.setup.title}
			count={todo.length}
			icon={<SparklesIcon size={14} />}
			tone="accent"
			flush
			className="mx-4 shrink-0"
		>
			{todo.map((id) => (
				<SettingsRow key={id} icon={ICON[id]} label={t.onboarding.setup.item[id]}>
					<SetupControl id={id} done={false} />
				</SettingsRow>
			))}
		</Panel>
	);
}

/** Settings / Me: the same items, next to Replay the tour (REQ-013). */
export function useSetupSection(): SettingsSection {
	const { t } = useI18n();
	const state = useSetup();
	return {
		id: "setup",
		title: t.onboarding.setup.title,
		rows: SETUP.map((id) => ({
			id: `setup-${id}`,
			icon: ICON[id],
			label: t.onboarding.setup.item[id],
			control: <SetupControl id={id} done={state[id]} pick={false} />,
		})),
	};
}
