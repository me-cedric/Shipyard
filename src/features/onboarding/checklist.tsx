import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { type ReactNode, useState } from "react";
import { connectionKeys, runnerKeys } from "@/features/settings/connections/keys";
import { DefaultAgentSelect } from "@/features/settings/me/personal";
import type { TabPath } from "@/features/shell";
import { useGuard } from "@/features/work/guard";
import { useDesignList } from "@/lib/design";
import { useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { type CliLogin, commands, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { projectKeys, useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { askForm } from "@/lib/shell";
import { useChanges } from "@/lib/specs";
import { useWorkItems } from "@/lib/sync";
import { useTeam, useWorkActions } from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Leave } from "@/ui/atoms/leave";
import { Progress } from "@/ui/atoms/progress";
import { StatusDot } from "@/ui/atoms/status-dot";
import {
	CheckIcon,
	CodeBracketIcon,
	CpuChipIcon,
	DocumentTextIcon,
	FolderOpenIcon,
	InboxIcon,
	PlayIcon,
	ShieldCheckIcon,
	SparklesIcon,
	SwatchIcon,
	UsersIcon,
	ViewColumnsIcon,
} from "@/ui/icons";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { Terms } from "@/ui/molecules/term";
import { usePermissions } from "./permissions";
import { closeTour } from "./tour-store";

/** The steps of a new project, in the order of need. */
export const ITEMS = [
	"project",
	"ai",
	"models",
	"tracker",
	"forge",
	"team",
	"permissions",
	"decision",
	"spec",
	"assign",
	"run",
] as const;
export type ItemId = (typeof ITEMS)[number];

const ICON: Record<ItemId, ReactNode> = {
	project: <FolderOpenIcon size={14} />,
	ai: <CpuChipIcon size={14} />,
	models: <CpuChipIcon size={14} />,
	tracker: <InboxIcon size={14} />,
	forge: <CodeBracketIcon size={14} />,
	team: <UsersIcon size={14} />,
	permissions: <ShieldCheckIcon size={14} />,
	decision: <SwatchIcon size={14} />,
	spec: <DocumentTextIcon size={14} />,
	assign: <ViewColumnsIcon size={14} />,
	run: <PlayIcon size={14} />,
};

/** The page of each item: the place of its action, and where a done item links to. */
const PLACE: Record<ItemId, { to: TabPath; hash?: string }> = {
	project: { to: "/home/projects" },
	ai: { to: "/settings/me", hash: "section-agent" },
	models: { to: "/settings/agents-rules", hash: "tiers" },
	tracker: { to: "/settings/project", hash: "issue-tracker" },
	forge: { to: "/settings/project", hash: "code-host" },
	team: { to: "/work/team" },
	permissions: { to: "/settings/me", hash: "section-permissions" },
	decision: { to: "/design/decisions" },
	spec: { to: "/specs/changes" },
	assign: { to: "/work/backlog" },
	run: { to: "/factory/runs" },
};

/** The host of `https://host/a/b.git` or `git@host:a/b.git`. */
export const remoteHost = (url: string) =>
	url.match(/^[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)/i)?.[1] ?? url.match(/^[^@]+@([^:]+):/)?.[1] ?? "";

/** The login of `gh` or `glab` for the host of the remote, else the first login. */
const loginFor = (logins: CliLogin[], remote: string | null) =>
	logins.find((l) => remote && l.host === remoteHost(remote)) ?? logins[0];

/**
 * The one place that decides "done" for each item, from the caches of the app. `done[id]` is
 * `undefined` while the state is not known. The other fields name the next step of an item.
 */
export function useChecklist() {
	const project = useActiveProject().data;
	const { defaultAgent, loaded } = usePrefs();
	const settings = useQuery({
		queryKey: projectKeys.settings,
		queryFn: () => unwrap(commands.projectSettings()),
	}).data;
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	}).data;
	const tiers = useQuery({ queryKey: ["tiers"], queryFn: () => unwrap(commands.tiersGet()) }).data;
	const connections = useQuery({
		queryKey: connectionKeys.list,
		queryFn: () => unwrap(commands.connectionsList()),
	}).data;
	const logins = useQuery({
		queryKey: [...connectionKeys.list, "logins"],
		queryFn: () => unwrap(commands.connectionsDetect()),
	}).data;
	const remote = useQuery({
		queryKey: ["code", "remote-url"],
		queryFn: () => unwrap(commands.codeRemoteUrl()),
	}).data;
	const permissions = usePermissions().data;
	const team = useTeam().data;
	const changes = useChanges().data;
	const runs = useRuns().data;
	const adrs = useDesignList().data?.adrs;
	const items = useWorkItems({}).data;

	const linked = settings?.file?.connections ?? {};
	const tool = runners?.find((r) => r.id === defaultAgent);
	const modelTool = defaultAgent || runners?.find((r) => r.state === "detected")?.id;
	const row = tiers?.find((r) => r.runner === modelTool);
	const accounts = (group: "tracker" | "forge") => connections?.some((c) => c.group === group);
	const done: Record<ItemId, boolean | undefined> = {
		project: project === undefined ? undefined : project !== null,
		// A default tool that is set, installed and not signed out.
		ai:
			loaded && runners
				? defaultAgent !== "" && tool?.state === "detected" && tool.auth !== "signedOut"
				: undefined,
		models: tiers && runners ? [row?.top, row?.mid, row?.small].some(Boolean) : undefined,
		tracker: settings === undefined ? undefined : Boolean(linked.tracker),
		forge: settings === undefined ? undefined : Boolean(linked.forge),
		team: team?.team.members.some((m) => m.admin),
		permissions: permissions?.every((p) => p.state !== "notAsked" && p.state !== "off"),
		decision: adrs && adrs.length > 0,
		spec: changes && changes.length > 0,
		assign: items?.some((i) => i.assignee),
		run: runs && runs.length > 0,
	};
	return {
		done,
		tool,
		file: settings?.file,
		missing: runners?.find((r) => r.state === "missing"),
		linked,
		hasAccount: { tracker: accounts("tracker"), forge: accounts("forge") },
		login: accounts("forge") ? undefined : loginFor(logins ?? [], remote ?? null),
	};
}
type Checklist = ReturnType<typeof useChecklist>;

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

/** One click that the app can do from what it detects: a `gh` login, a missing AI tool. */
function OneClick({
	label,
	confirm,
	run,
}: {
	label: string;
	confirm?: string;
	run: () => Promise<unknown>;
}) {
	const qc = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const go = async () => {
		setBusy(true);
		setError(null);
		try {
			await run();
			await qc.invalidateQueries();
		} catch (e) {
			setError(e);
		} finally {
			setBusy(false);
		}
	};
	return (
		<>
			{confirm ? (
				<ConfirmButton disabled={busy} confirm={confirm} onConfirm={() => void go()}>
					{label}
				</ConfirmButton>
			) : (
				<Button variant="primary" disabled={busy} onClick={() => void go()}>
					{label}
				</Button>
			)}
			<ErrorNotice error={error} className="text-ui text-danger-text" />
		</>
	);
}

/** The state of one item and its one action: in place for a single control, else the place of the step. */
export function ChecklistControl({
	id,
	state,
	pick = true,
}: {
	id: ItemId;
	state: Checklist;
	/** Show the AI tool select. Settings / Me has it on the page already. */
	pick?: boolean;
}) {
	const { t } = useI18n();
	const s = t.onboarding.setup;
	const navigate = useNavigate();
	const done = state.done[id];
	// A step that leaves the tour ends it: the tour marks itself as seen.
	const go = (to: TabPath, hash?: string, form?: string) => () => {
		if (form) askForm(form);
		closeTour();
		void navigate({ to, hash });
	};
	const open = (label: string, to: TabPath, hash?: string, form?: string, primary = true) => (
		<Button variant={primary ? "primary" : undefined} onClick={go(to, hash, form)}>
			{label}
		</Button>
	);
	const connect = (group: "tracker" | "forge") =>
		state.hasAccount[group]
			? open(
					s.action.choose,
					"/settings/project",
					group === "tracker" ? "issue-tracker" : "code-host",
				)
			: open(
					s.action.connect,
					"/settings/connections",
					undefined,
					group === "tracker" ? "connection" : "connection:forge",
				);
	const { tool, file, linked, login, missing } = state;
	// The select is the choice in place. Settings / Me has the select on the page: a button points to it.
	const ai = () => {
		// No default tool, or a missing one: what the old Install an agent step offered.
		const gone = tool ? (tool.state === "missing" ? tool : undefined) : missing;
		return (
			<>
				{!tool && !pick ? open(s.action.choose, "/settings/me", "section-agent") : null}
				{gone ? (
					<OneClick
						label={format(s.action.install, { name: gone.label })}
						confirm={format(s.action.installConfirm, { name: gone.label, command: gone.install })}
						run={() => unwrap(commands.runnerInstall(gone.id, true))}
					/>
				) : null}
				{tool && tool.state !== "missing"
					? open(s.action.signIn, "/settings/agents-rules", "tools")
					: open(
							s.action.openRunner,
							"/settings/connections",
							"connections-runner",
							undefined,
							false,
						)}
			</>
		);
	};
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
			{done ? (
				<Button
					aria-label={format(s.action.viewItem, { name: s.item[id] })}
					onClick={go(PLACE[id].to, PLACE[id].hash)}
				>
					{s.action.view}
				</Button>
			) : null}
			{todo && id === "project"
				? open(s.action.project, "/home/projects", undefined, "project")
				: null}
			{todo && id === "ai" ? ai() : null}
			{todo && id === "models" ? open(s.action.models, "/settings/agents-rules", "tiers") : null}
			{todo && id === "tracker" ? connect("tracker") : null}
			{todo && id === "forge" ? (
				login && file ? (
					<OneClick
						label={format(s.action.useLogin, { tool: login.tool, user: login.user })}
						run={async () => {
							const c = await unwrap(commands.connectionsUseLogin(login.tool, login.host, true));
							await unwrap(
								commands.projectFileSave({ ...file, connections: { ...linked, forge: c.id } }),
							);
						}}
					/>
				) : (
					connect("forge")
				)
			) : null}
			{todo && id === "team" ? (
				<>
					<AddMe />
					{open(s.action.openTeam, "/work/team", undefined, "member", false)}
				</>
			) : null}
			{todo && id === "permissions"
				? open(s.action.permissions, "/settings/me", "section-permissions")
				: null}
			{todo && id === "decision"
				? open(s.action.decision, "/design/decisions", undefined, "adr")
				: null}
			{todo && id === "spec" ? open(s.action.spec, "/specs/changes", undefined, "change") : null}
			{todo && id === "assign" ? open(s.action.assign, "/work/backlog", undefined, "assign") : null}
			{todo && id === "run" ? open(s.action.run, "/factory/runs", undefined, "run") : null}
		</>
	);
}

/** The items `ids` as settings rows: the tour step. */
export function ChecklistList({ ids }: { ids: readonly ItemId[] }) {
	const { t } = useI18n();
	const state = useChecklist();
	return (
		<ul aria-label={t.onboarding.setup.title} className="rounded-lg border bg-surface-2">
			{ids.map((id) => (
				<li key={id}>
					<SettingsRow icon={ICON[id]} label={<Terms>{t.onboarding.setup.item[id]}</Terms>}>
						<ChecklistControl id={id} state={state} />
					</SettingsRow>
				</li>
			))}
		</ul>
	);
}

/**
 * The Get started card of Home / Today and of Settings / Me: the same items and the same rule for
 * done. On Today (`onlyTodo`) it lists what is to do and goes away when nothing is.
 */
export function Checklist({
	id,
	onlyTodo,
	className,
}: {
	id?: string;
	onlyTodo?: boolean;
	className?: string;
}) {
	const { t } = useI18n();
	const s = t.onboarding.setup;
	const state = useChecklist();
	const left = ITEMS.filter((item) => state.done[item] === false);
	// A loading item is not done.
	const done = ITEMS.filter((item) => state.done[item] === true).length;
	const next = left[0];
	const shown = onlyTodo ? left : ITEMS;
	// The panel leaves with its last item: it stays mounted until the exit ends.
	return (
		<AnimatePresence initial={false}>
			{onlyTodo && left.length === 0 ? null : (
				// A long inbox under it must not squeeze the items away (`className`).
				<Leave key="checklist" className={className}>
					<Panel
						id={id}
						title={s.title}
						count={done}
						icon={<SparklesIcon size={14} />}
						tone="accent"
						flush
						toolbar={
							<Progress
								value={done}
								max={ITEMS.length}
								label={format(t.count, { name: s.title, count: done })}
								className="w-32"
							/>
						}
					>
						<AnimatePresence initial={false}>
							{shown.map((item) => (
								// The border sits on the wrapper: the row is its only child, so `last:` on the row never differs.
								<Leave key={item} className="border-b last:border-b-0">
									<SettingsRow
										icon={ICON[item]}
										current={item === next}
										label={<Terms>{s.item[item]}</Terms>}
									>
										<ChecklistControl id={item} state={state} pick={Boolean(onlyTodo)} />
									</SettingsRow>
								</Leave>
							))}
						</AnimatePresence>
					</Panel>
				</Leave>
			)}
		</AnimatePresence>
	);
}
