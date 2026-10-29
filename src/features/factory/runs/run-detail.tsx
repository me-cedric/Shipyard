import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useRunActions, useRunDiff, useRunLog, useRuns, useWorkflow } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { RunState } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { StatusDot } from "@/ui/atoms/status-dot";
import { DiffView } from "@/ui/molecules/diff-view";
import { FindingRow } from "@/ui/molecules/finding-row";
import { RUN_STATUS } from "@/ui/molecules/run-card";
import { Stat } from "@/ui/molecules/stat";
import { RunGraph } from "@/ui/organisms/run-graph";

const ENDED: RunState[] = ["Merged", "Done", "Failed", "Cancelled"];
const SEVERITY = { P0: "danger", P1: "warning", P2: "info" } as const;

/** Pretty-prints a JSON payload. A text that is not JSON stays as it is. */
export function pretty(payload: string): string {
	try {
		return JSON.stringify(JSON.parse(payload), null, 2);
	} catch {
		return payload;
	}
}

/** The run view, in the inspector: graph, actions, cost, findings, diff and event tail (factory REQ-027, REQ-028). */
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
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<span className="font-mono text-12 text-n-11">{run.key}</span>
				<StatusDot status={RUN_STATUS[run.state]} label={f.state[run.state]} />
				<span className="text-12">{f.state[run.state]}</span>
			</div>
			<p className="text-ui font-medium">{run.title}</p>
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
			<dl className="flex flex-wrap gap-3">
				<Stat label={f.cost} value={n(run.costUsd, usd)} />
				<Stat label={f.budget} value={n(run.budgetUsd, usd)} />
				<Stat label={f.tokens} value={String(run.tokens)} />
				<Stat label={f.turns} value={String(run.turns)} />
			</dl>
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
				<section aria-label={f.findings}>
					<h3 className="text-12 font-medium text-n-11">
						{format(t.count, { name: f.findings, count: run.findings.length })}
					</h3>
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
				</section>
			) : null}
			{diff.length ? (
				<section aria-label={f.diff}>
					<h3 className="text-12 font-medium text-n-11">
						{format(t.count, { name: f.diff, count: diff.length })}
					</h3>
					{diff.map((d) => (
						<div key={d.path}>
							<p className="font-mono text-11 text-n-11">{d.path}</p>
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
				</section>
			) : null}
			<section aria-label={f.log}>
				<h3 className="text-12 font-medium text-n-11">
					{format(t.count, { name: f.log, count: log.events.length })}
				</h3>
				<ol className="flex flex-col gap-1">
					{log.events.map((e) => (
						<li key={e.id} className="border-b pb-1">
							<span className="font-mono text-11 text-n-11">
								{e.step ? `${e.step} ` : ""}
								{e.kind}
							</span>
							<pre className="overflow-x-auto font-mono text-11">{pretty(e.payload)}</pre>
						</li>
					))}
				</ol>
				{log.hasNextPage ? (
					<Button onClick={() => void log.fetchNextPage()}>{f.more}</Button>
				) : null}
			</section>
		</div>
	);
}
