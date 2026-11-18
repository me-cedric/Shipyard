import { useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { featureHref, stateText, useFeatures } from "@/features/flow/feature";
import { factoryKeys, useRuns, useSessions } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { commands, type SessionView, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize as Feature } from "@/lib/ipc/bindings";
import { copyText } from "@/lib/menus";
import { useShell } from "@/lib/shell";
import { Segmented } from "@/ui/atoms/segmented";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { EmptyState } from "@/ui/molecules/empty-state";
import { RefChip } from "@/ui/molecules/ref-chip";

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
	/** The refs that it reads and changes: the ticket, the run, the spec of the feature, the files of its findings. */
	refs: string[];
};

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
			refs: [
				...(run ? [`wi:${run.key}`, run.reference] : []),
				...(feature?.change ? [feature.change] : []),
				...files,
			],
		};
	});
	return { rows, ready: !!runs.data && !!sessions.data };
}

type Filter = "work" | "ended" | "files" | "specs";
const isFile = (ref: string) => ref.startsWith("doc:");
const isSpec = (ref: string) => /^(spec|change):/.test(ref);

/**
 * Crew / Live: one row for each agent, with its feature and the refs that it reads and changes
 * (`spec:app-redesign#REQ-017`). It replaces the agents map: a ref opens its entity, the agent
 * opens its run at its unit, and each ref has Copy ref.
 */
export function LiveRows({ rows, ready }: { rows: AgentRow[]; ready: boolean }) {
	const { t } = useI18n();
	const c = t.crewPlace;
	const { openRef } = useShell();
	const navigate = useNavigate();
	const [filter, setFilter] = useState<Filter>("work");
	const shown = rows.filter((r) =>
		filter === "work"
			? atWork(r)
			: filter === "ended"
				? r.session.state === "done" || r.session.state === "failed"
				: r.refs.some(filter === "files" ? isFile : isSpec),
	);
	// The rows show the runs that Shipyard starts. With none, the page says so and leads to Flow.
	if (ready && rows.length === 0)
		return (
			<EmptyState
				title={t.empty.runs}
				action={{ label: t.ui.place.flow, onClick: () => void navigate({ to: "/flow/flow" }) }}
			/>
		);
	return (
		<>
			<div className="w-full max-w-md">
				<Segmented
					label={t.factory.runsList.filter}
					value={filter}
					onValueChange={setFilter}
					items={[
						{ value: "work", label: c.work },
						{ value: "ended", label: t.factory.runsList.ended },
						{ value: "files", label: c.files },
						{ value: "specs", label: c.specs },
					]}
				/>
			</div>
			{ready && shown.length === 0 ? (
				<EmptyState title={t.empty.sessions} />
			) : (
				<div className="overflow-x-auto rounded-xl bg-surface-2 px-4 shadow-1">
					<table aria-label={c.atWork} className="w-full text-left text-ui">
						<thead>
							<tr className="text-12 text-n-11">
								<th className="py-3 font-medium">{t.factory.agent}</th>
								<th className="py-3 font-medium">{c.feature}</th>
								<th className="py-3 font-medium">{c.touches}</th>
							</tr>
						</thead>
						<tbody>
							{shown.map((r) => (
								<tr key={r.id} className="border-t">
									<td className="py-1 pr-3">
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
												className="min-h-control font-medium text-n-12 hover:underline"
											>
												{nameOf(r.role ?? r.session.step)}
											</button>
										</ContextMenu>
									</td>
									<td className="py-1 pr-3">
										{r.feature ? (
											<Link
												{...featureHref(r.feature)}
												className="inline-flex min-h-control items-center gap-2 font-medium text-n-12 hover:underline"
											>
												{r.title}
												<span className="font-normal text-n-11">{stateText(t, r.feature)}</span>
											</Link>
										) : (
											r.title
										)}
									</td>
									<td className="py-1">
										<span className="flex flex-wrap gap-1.5">
											{r.refs.map((ref) => (
												<RefChip
													key={ref}
													refId={ref}
													state="resolved"
													text={isFile(ref) ? ref.split("/").at(-1) : undefined}
													onOpen={openRef}
												/>
											))}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}
