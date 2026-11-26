import { useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { featureHref, needsPerson, stateText, useFeatures } from "@/features/flow/feature";
import { factoryKeys, useRuns, useSessions } from "@/lib/factory";
import type { Messages } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { commands, type SessionView, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize as Feature } from "@/lib/ipc/bindings";
import { copyText, useMenus } from "@/lib/menus";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Chip } from "@/ui/atoms/chip";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { EmptyState } from "@/ui/molecules/empty-state";

/** One agent session with what the runs of today tell about it. */
export type AgentRow = {
	/** The ref of the session, `run:<run>/<step>`: it opens the run at this unit. */
	id: string;
	session: SessionView;
	/** The role of its step in the workflow, when the workflow file is valid. */
	role?: string;
	/** The title of the ticket of the run. */
	title: string;
	feature?: Feature;
	/** The id of its run, when the session is a step of a run. */
	run?: string;
	/** The refs that it reads and changes: the spec change of the feature and the files of its findings. */
	refs: string[];
};

/** One row for each run: two units of one step show one time. */
export const byRun = (rows: AgentRow[]) => [
	...new Map(rows.map((r) => [r.session.run || r.session.key, r] as const)).values(),
];

/** A session that has not ended (the rule of Crew / Sessions). */
export const atWork = (r: AgentRow) => r.session.state === "running" || r.session.state === "gate";

/** The sessions of the project, each with its role, its feature and its refs. The data of the agents map of before. */
export function useAgentRows() {
	const runs = useRuns();
	const sessions = useSessions();
	const features = useFeatures().data;
	const ids = useMemo(() => [...new Set((runs.data ?? []).map((r) => r.workflow))], [runs.data]);
	// The same cache as the run page: the parsed workflow says which role runs a step.
	const flows = useQueries({
		queries: ids.map((id) => ({
			queryKey: factoryKeys.workflow(id),
			queryFn: async () => (await unwrap(commands.workflowGet(id))).workflow,
		})),
	});
	const rows = (sessions.data ?? []).map((s): AgentRow => {
		const run = runs.data?.find((r) => r.id === s.run);
		// A unit of a step that fans out has its own id: the role is the one of its step.
		const step = run?.steps.find((x) => x.id === s.step || x.units.some((u) => u.id === s.step));
		const feature = features?.find((f) => f.run === `run:${s.run}` || f.ticket === `wi:${s.key}`);
		const files = new Set(run?.findings.flatMap((x) => (x.path ? [`doc:${x.path}`] : [])));
		return {
			id: `run:${s.run}/${s.step}`,
			session: s,
			role: flows[ids.indexOf(run?.workflow ?? "")]?.data?.steps.find((x) => x.id === step?.id)
				?.role,
			title: run?.title ?? s.key,
			feature,
			run: run?.id,
			refs: [...(feature?.change ? [feature.change] : []), ...files],
		};
	});
	return { rows, ready: !!runs.data && !!sessions.data };
}

type Filter = "work" | "ended" | "files" | "specs";
/** A duty of the person reads "Waits for you" (picture 030); a block or a limit keeps its own words. */
const waitText = (t: Messages, f: Feature) =>
	f.questions > 0 ||
	f.approvals > 0 ||
	f.runState === "PlanReview" ||
	f.runState === "WaitingForAnswer"
		? t.crewPlace.waitsForYou
		: stateText(t, f);
const isFile = (ref: string) => ref.startsWith("doc:");
const isSpec = (ref: string) => /^(spec|change):/.test(ref);
const BLOCK =
	"flex min-h-control min-w-0 flex-1 items-center gap-3 rounded-md bg-n-2 px-3.5 font-semibold text-n-12";
const HEAD = "py-3 text-13 font-semibold text-n-11";

/** The line from the agent to its feature and from the feature to its files: blue while the agent works. */
const Line = ({ on }: { on: boolean }) => (
	<span aria-hidden="true" className={cn("h-0.5 w-9 shrink-0", on ? "bg-accent" : "bg-n-7")} />
);

/**
 * Crew / Live: one row for each run with an agent, with its feature and the files and specs that
 * it reads and changes (`spec:app-redesign#REQ-017`). It replaces the agents map: a chip opens its
 * entity, the agent opens its run at its unit, and each one has Copy ref.
 */
export function LiveRows({ rows, ready }: { rows: AgentRow[]; ready: boolean }) {
	const { t } = useI18n();
	const c = t.crewPlace;
	const { openRef } = useShell();
	const menu = useMenus();
	const navigate = useNavigate();
	const [filter, setFilter] = useState<Filter>("work");
	// The same cache as the feature page: the changed files of each run.
	const ids = [...new Set(rows.flatMap((r) => (r.run ? [r.run] : [])))];
	const diffs = useQueries({
		queries: ids.map((id) => ({
			queryKey: factoryKeys.diff(id),
			queryFn: () => unwrap(commands.runDiff(id)),
		})),
	});
	const refsOf = (r: AgentRow) => [
		...new Set([
			...r.refs,
			...(diffs[ids.indexOf(r.run ?? "")]?.data ?? []).map((d) => `doc:${d.path}`),
		]),
	];
	const shown = byRun(
		rows.filter((r) =>
			filter === "work"
				? atWork(r)
				: filter === "ended"
					? r.session.state === "done" || r.session.state === "failed"
					: refsOf(r).some(filter === "files" ? isFile : isSpec),
		),
	);
	// The rows show the runs that Shipyard starts. With none, the page says so and leads to Flow.
	if (ready && rows.length === 0)
		return (
			<EmptyState
				title={t.empty.runs}
				action={{ label: t.home.openFlow, onClick: () => void navigate({ to: "/flow/flow" }) }}
			/>
		);
	const filters: { value: Filter; label: string }[] = [
		{ value: "work", label: c.work },
		{ value: "ended", label: t.factory.runsList.ended },
		{ value: "files", label: c.files },
		{ value: "specs", label: c.specs },
	];
	return (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box */}
			<div role="group" aria-label={t.factory.runsList.filter} className="flex flex-wrap gap-2">
				{filters.map((f) => (
					<Chip
						key={f.value}
						selected={filter === f.value}
						className={filter === f.value ? undefined : "bg-surface-2"}
						onClick={() => setFilter(f.value)}
					>
						{f.label}
					</Chip>
				))}
			</div>
			{ready && shown.length === 0 ? (
				<EmptyState title={t.empty.sessions} />
			) : (
				<div className="overflow-x-auto rounded-lg bg-surface-2 px-6 py-2 shadow-2">
					<table aria-label={c.atWork} className="w-full min-w-205 text-left">
						<thead>
							<tr>
								<th className={HEAD}>{t.factory.agent}</th>
								<th className={cn(HEAD, "px-9")}>{c.feature}</th>
								<th className={HEAD}>{c.touches}</th>
							</tr>
						</thead>
						<tbody>
							{shown.map((r) => {
								const name = nameOf(r.role ?? r.session.step, t.factory.agentNames);
								const wait = r.feature && needsPerson(r.feature);
								const on = r.session.state === "running" && !wait;
								// shortcut: the first six refs show; the feature page lists each changed file.
								const refs = refsOf(r).slice(0, 6);
								return (
									<tr key={r.id} className="border-t border-n-6">
										<td className="w-44 py-3">
											<ContextMenu
												items={[
													{ id: "copy", label: t.context.copyRef, onSelect: () => copyText(r.id) },
												]}
											>
												<button
													type="button"
													title={r.id}
													// An estimate is no run: its agent opens the sheet (the key of the session).
													onClick={() =>
														r.session.step === "estimate"
															? void navigate({
																	to: "/plan/estimates",
																	search: { sheet: r.session.key } as never,
																})
															: openRef(r.id)
													}
													className="flex min-h-control items-center gap-2.5 font-semibold text-n-12 hover:underline"
												>
													<span aria-hidden="true" className="flex">
														<Avatar agent name={name} />
													</span>
													{name}
												</button>
											</ContextMenu>
										</td>
										<td className="py-3">
											<span className="flex items-center">
												<Line on={on} />
												{r.feature ? (
													<Link {...featureHref(r.feature)} className={BLOCK}>
														<span className="min-w-0 truncate">{r.title}</span>
														{wait ? (
															<Badge variant="you" className="ml-auto">
																{waitText(t, r.feature)}
															</Badge>
														) : null}
													</Link>
												) : (
													<span className={BLOCK}>{r.title}</span>
												)}
												<Line on={on} />
											</span>
										</td>
										<td className="py-3">
											<span className="flex flex-wrap gap-1.5">
												{refs.map((ref) => (
													<ContextMenu
														key={ref}
														items={menu("ref", {
															open: () => openRef(ref),
															"copy-ref": () => copyText(ref),
														})}
													>
														<Chip title={ref} data-ask={ref} onClick={() => openRef(ref)}>
															{isFile(ref) ? ref.split("/").at(-1) : ref}
														</Chip>
													</ContextMenu>
												))}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}
