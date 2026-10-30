import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useRunActions, useRunDiff, useRunLog, useRuns, useWorkflow } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { RunState, RunView } from "@/lib/ipc";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Progress } from "@/ui/atoms/progress";
import { StatusDot } from "@/ui/atoms/status-dot";
import { DiffView } from "@/ui/molecules/diff-view";
import { FindingRow } from "@/ui/molecules/finding-row";
import { Panel } from "@/ui/molecules/panel";
import { RUN_STATUS, STATUS_BADGE } from "@/ui/molecules/run-card";
import { SpendMeter } from "@/ui/molecules/spend-meter";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { RunGraph } from "@/ui/organisms/run-graph";

const ENDED: RunState[] = ["Merged", "Done", "Failed", "Cancelled"];
const SEVERITY = { P0: "danger", P1: "warning", P2: "info" } as const;

/** The steps done out of all steps, and the step that works now. */
export function progressOf(run: RunView) {
	const running = run.steps.find((s) => s.state === "running");
	return {
		done: run.steps.filter((s) => s.state === "done").length,
		total: run.steps.length,
		agent: running?.id,
		live: running !== undefined,
	};
}

/** Pretty-prints a JSON payload. A text that is not JSON stays as it is. */
export function pretty(payload: string): string {
	try {
		return JSON.stringify(JSON.parse(payload), null, 2);
	} catch {
		return payload;
	}
}

/** The run view: actions, cost, graph, findings, diff and event tail (factory REQ-027, REQ-028). */
export function RunDetail({ id }: { id: string }) {
	const { t } = useI18n();
	const f = t.factory;
	const run = useRuns().data?.find((r) => r.id === id);
	const workflow = useWorkflow(run?.workflow ?? "").data;
	const diff = useRunDiff(id).data ?? [];
	const log = useRunLog(id);
	const act = useRunActions();
	const { error, run: guard } = useGuard();
	const [note, setNote] = useState("");
	const [add, setAdd] = useState("");
	if (!run) return null;
	const n = (v: number | null, fmt: (x: number) => string) => (v === null ? "-" : fmt(v));
	const usd = (x: number) => `$${x.toFixed(2)}`;
	const status = RUN_STATUS[run.state];
	const p = progressOf(run);
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center gap-2">
					<span className="font-mono text-12 text-n-11">{run.key}</span>
					<Badge variant={STATUS_BADGE[status]}>
						<StatusDot status={status} label={f.state[run.state]} className="size-2" />
						{f.state[run.state]}
					</Badge>
					<Badge className="font-mono">{run.workflow}</Badge>
				</div>
				<p className="text-16 font-semibold text-n-12">{run.title}</p>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				{run.state === "PlanReview" ? (
					<>
						<Input
							label={f.note}
							className="max-w-40"
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
						<Button onClick={() => void guard(() => act.planReject(id, note))}>
							{f.planReject}
						</Button>
						<Button variant="primary" onClick={() => void guard(() => act.planApprove(id))}>
							{f.planApprove}
						</Button>
					</>
				) : null}
				{run.state === "Paused" ? (
					<>
						<Input
							label={f.addBudget}
							inputMode="decimal"
							className="max-w-32"
							value={add}
							onChange={(e) => setAdd(e.target.value)}
						/>
						<Button
							onClick={() =>
								void guard(() => act.resume(id, add.trim() === "" ? null : Number(add)))
							}
						>
							{f.resume}
						</Button>
					</>
				) : null}
				{run.state === "Blocked" ? (
					<Button onClick={() => void guard(() => act.unblock(id))}>{f.unblock}</Button>
				) : null}
				{ENDED.includes(run.state) ? null : (
					<Button variant="danger" onClick={() => void guard(() => act.cancel(id))}>
						{f.kill}
					</Button>
				)}
			</div>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<StatStrip
				items={[
					{
						label: f.cost,
						value: n(run.costUsd, usd),
						delta: run.budgetUsd === null ? undefined : `/ ${usd(run.budgetUsd)}`,
						tone: "info",
						extra: (
							<SpendMeter
								usd={run.costUsd ?? 0}
								budget={run.budgetUsd}
								label={`${f.cost} ${run.key}`}
							/>
						),
					},
					{
						label: f.steps,
						value: `${p.done}/${p.total}`,
						tone: "accent",
						extra: (
							<Progress
								value={p.done}
								max={p.total}
								label={format(f.stepsDone, { done: p.done, total: p.total })}
							/>
						),
					},
					{ label: f.tokens, value: run.tokens.toLocaleString(), tone: "accent" },
					{ label: f.turns, value: String(run.turns), tone: "accent" },
				]}
			/>
			{workflow ? (
				<RunGraph
					label={f.workflow}
					steps={workflow.steps.map((s) => {
						const live = run.steps.find((x) => x.id === s.id);
						return {
							id: s.id,
							needs: s.needs ?? [],
							state: live?.state ?? "pending",
							units: s.for_each ? live?.units.length : undefined,
						};
					})}
				/>
			) : null}
			{run.findings.length ? (
				<Panel title={f.findings} count={run.findings.length} tone="warning" flush>
					{run.findings.map((x, i) => (
						<FindingRow
							// biome-ignore lint/suspicious/noArrayIndexKey: the findings never reorder
							key={i}
							status={SEVERITY[x.severity as keyof typeof SEVERITY] ?? "info"}
							title={x.text}
							source={
								x.path ? (
									<span className="font-mono text-11 text-n-11">
										{x.path}
										{x.line ? `:${x.line}` : ""}
									</span>
								) : undefined
							}
						/>
					))}
				</Panel>
			) : null}
			{diff.length ? (
				<Panel title={f.diff} count={diff.length} flush>
					{diff.map((d) => (
						<div key={d.path} className="border-b last:border-b-0">
							<p className="bg-n-2 px-3 py-1 font-mono text-11 text-n-11">{d.path}</p>
							<DiffView
								text={d.text}
								binary={d.binary}
								truncated={d.truncated}
								label={format(t.code.diff, { path: d.path })}
								binaryLabel={t.code.binary}
								truncatedLabel={t.code.truncated}
							/>
						</div>
					))}
				</Panel>
			) : null}
			<Panel
				title={f.log}
				count={log.events.length}
				flush
				className="canvas-dark"
				bodyClassName="bg-surface-0"
			>
				<ol className="flex flex-col p-3 font-mono text-11 leading-5 text-n-12">
					{log.events.map((e) => (
						<li key={e.id} className="flex gap-2 whitespace-pre-wrap">
							<span aria-hidden="true" className="select-none text-n-9">
								$
							</span>
							<span className="min-w-0 flex-1">
								<span className="text-accent-text">{e.step ? `${e.step} ` : ""}</span>
								<span className="text-success-text">{e.kind}</span>
								<pre className="overflow-x-auto text-n-11">{pretty(e.payload)}</pre>
							</span>
						</li>
					))}
				</ol>
				{log.hasNextPage ? (
					<div className="border-t p-2">
						<Button variant="ghost" onClick={() => void log.fetchNextPage()}>
							{f.more}
						</Button>
					</div>
				) : null}
			</Panel>
		</div>
	);
}
