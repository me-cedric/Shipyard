import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDesignList } from "@/lib/design";
import { useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { type CliLogin, commands, unwrap } from "@/lib/ipc";
import { projectKeys } from "@/lib/projects";
import { askForm } from "@/lib/shell";
import { useChanges } from "@/lib/specs";
import { useWorkItems } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { useTeam } from "@/lib/work";
import { Progress } from "@/ui/atoms/progress";
import { CheckIcon, ChevronRightIcon, SparklesIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";

type Place =
	| "/settings/project"
	| "/settings/connections"
	| "/work/team"
	| "/work/backlog"
	| "/design/decisions"
	| "/specs/changes"
	| "/factory/runs";
type StepId = "tracker" | "forge" | "agent" | "team" | "decision" | "spec" | "assign" | "run";
type Step = {
	id: StepId;
	done: boolean;
	to: Place;
	/** The form that the place opens. */
	form?: string;
	/** A detected one-click way to do the step: it replaces the link. */
	act?: { label: string; run: () => Promise<unknown> };
};

/** The host of `https://host/a/b.git` or `git@host:a/b.git`. */
export const remoteHost = (url: string) =>
	url.match(/^[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)/i)?.[1] ?? url.match(/^[^@]+@([^:]+):/)?.[1] ?? "";

/** The login of `gh` or `glab` for the host of the remote, else the first login. */
const loginFor = (logins: CliLogin[], remote: string | null) =>
	logins.find((l) => remote && l.host === remoteHost(remote)) ?? logins[0];

/**
 * The setup of a new project, each step done from the real state of the project. A step that the
 * app can do from what it detects (a `gh` or `glab` login, a missing agent CLI) is one click; the
 * other steps open their form. The panel goes away when every step is done.
 */
export function GetStarted() {
	const { t } = useI18n();
	const s = t.home.start;
	const qc = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const settings = useQuery({
		queryKey: projectKeys.settings,
		queryFn: () => unwrap(commands.projectSettings()),
	}).data;
	// The same caches as Settings / Connections and Settings / Project.
	const connections = useQuery({
		queryKey: ["connections", "list"],
		queryFn: () => unwrap(commands.connectionsList()),
	}).data;
	const logins = useQuery({
		queryKey: ["connections", "list", "logins"],
		queryFn: () => unwrap(commands.connectionsDetect()),
	}).data;
	const remote = useQuery({
		queryKey: ["code", "remote-url"],
		queryFn: () => unwrap(commands.codeRemoteUrl()),
	}).data;
	const runners = useQuery({
		queryKey: ["runners", "list"],
		queryFn: () => unwrap(commands.runnersList()),
	}).data;
	const team = useTeam().data;
	const changes = useChanges().data;
	const runs = useRuns().data;
	const adrs = useDesignList().data?.adrs;
	const items = useWorkItems({}).data;
	if (!(settings && connections && team && changes && runs && runners)) return null;
	const file = settings.file;
	const linked = file?.connections ?? {};
	// With no account of the kind, the step opens Connections; with one, the project picks it.
	const place = (group: "tracker" | "forge"): Place =>
		connections.some((c) => c.group === group) ? "/settings/project" : "/settings/connections";
	const login = connections.some((c) => c.group === "forge")
		? undefined
		: loginFor(logins ?? [], remote ?? null);
	const missing = runners.find((r) => r.state === "missing");
	const steps: Step[] = [
		{ id: "tracker", done: Boolean(linked.tracker), to: place("tracker"), form: "connection" },
		{
			id: "forge",
			done: Boolean(linked.forge),
			to: place("forge"),
			form: "connection",
			act:
				login && file
					? {
							label: format(s.useLogin, { tool: login.tool, user: login.user }),
							run: async () => {
								const c = await unwrap(commands.connectionsUseLogin(login.tool, login.host, true));
								await unwrap(
									commands.projectFileSave({ ...file, connections: { ...linked, forge: c.id } }),
								);
							},
						}
					: undefined,
		},
		{
			id: "agent",
			done: runners.some((r) => r.state === "detected"),
			to: "/settings/connections",
			act: missing
				? {
						label: format(s.install, { name: missing.label }),
						run: () => unwrap(commands.runnerInstall(missing.id, true)),
					}
				: undefined,
		},
		{ id: "team", done: team.team.members.length > 0, to: "/work/team", form: "member" },
		{ id: "decision", done: (adrs?.length ?? 0) > 0, to: "/design/decisions", form: "adr" },
		{ id: "spec", done: changes.length > 0, to: "/specs/changes", form: "change" },
		{
			id: "assign",
			done: (items ?? []).some((i) => i.assignee),
			to: "/work/backlog",
			form: "assign",
		},
		{ id: "run", done: runs.length > 0, to: "/factory/runs", form: "run" },
	];
	const done = steps.filter((x) => x.done).length;
	const next = steps.findIndex((x) => !x.done);
	if (done === steps.length) return null;
	const act = async (job: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await job();
			await qc.invalidateQueries();
		} catch (e) {
			setError(e);
		} finally {
			setBusy(false);
		}
	};
	const cell =
		"group flex h-full w-full items-center gap-2.5 rounded-md p-2 text-left text-ui transition-colors duration-(--duration-fast) hover:bg-n-3";
	return (
		<Panel
			title={s.title}
			count={done}
			icon={<SparklesIcon size={14} />}
			tone="accent"
			flush
			toolbar={
				<Progress
					value={done}
					max={steps.length}
					label={format(t.count, { name: s.title, count: done })}
					className="w-32"
				/>
			}
			// A long inbox under it must not squeeze the steps away.
			className="mx-4 shrink-0"
		>
			<ol
				aria-label={s.title}
				className="grid grid-cols-1 gap-1 p-1.5 sm:grid-cols-2 lg:grid-cols-4"
			>
				{steps.map((step, i) => {
					const body = (
						<>
							<span
								aria-hidden="true"
								className={cn(
									"flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-11",
									step.done ? "bg-success text-accent-fg" : "border border-n-7 text-n-11",
								)}
							>
								{step.done ? <CheckIcon size={12} /> : i + 1}
							</span>
							<span
								className={cn("min-w-0 flex-1", step.done ? "text-n-10 line-through" : "text-n-12")}
							>
								{step.act && !step.done ? step.act.label : s[step.id]}
								{step.done ? <span className="sr-only"> {s.done}</span> : null}
							</span>
							<span aria-hidden="true" className="flex text-n-10 group-hover:text-n-12">
								<ChevronRightIcon size={14} />
							</span>
						</>
					);
					const current = i === next ? "step" : undefined;
					const run = step.act && !step.done ? step.act.run : null;
					return (
						<li key={step.id}>
							{run ? (
								<button
									type="button"
									aria-current={current}
									disabled={busy}
									onClick={() => void act(run)}
									className={cn(cell, "text-accent-text")}
								>
									{body}
								</button>
							) : (
								<Link
									to={step.to}
									aria-current={current}
									onClick={() => (step.form && !step.done ? askForm(step.form) : undefined)}
									className={cell}
								>
									{body}
								</Link>
							)}
						</li>
					);
				})}
			</ol>
			{error ? <ErrorNotice error={error} className="px-3 pb-2 text-ui text-danger-text" /> : null}
		</Panel>
	);
}
