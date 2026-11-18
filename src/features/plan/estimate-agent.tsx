import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import type { EstimateProposal } from "@/lib/ipc/bindings";
import { RightButton } from "@/lib/rights";
import { figure, type SheetView, type Task, useSealState, useWorkActions } from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/** The task with the three values of the proposal. Its assumptions go after the ones it has. */
export function withProposal({ percent: _percent, ...task }: Task, p: EstimateProposal): Task {
	const had = task.assumptions ?? "";
	const lines = [had, ...p.assumptions.filter((x) => !had.includes(x))].filter(Boolean);
	return {
		...task,
		days: p.likely,
		optimistic: p.best,
		pessimistic: p.worst,
		...(lines.length > 0 ? { assumptions: lines.join("\n") } : {}),
	};
}

/**
 * "Ask an agent to estimate" for the selected tasks (`spec:app-redesign#REQ-030`,
 * `spec:app-redesign#REQ-033`). The agent only proposes: a value enters the sheet when the person
 * accepts it. A sealed or frozen sheet turns the action off.
 */
export function EstimateAgent({
	slug,
	view,
	ids,
}: {
	slug: string;
	view: SheetView;
	/** The selected tasks. */
	ids: string[];
}) {
	const { t, lang } = useI18n();
	const a = t.costing.agent;
	const c = t.costing.task;
	const seal = useSealState().data;
	const act = useWorkActions();
	const asking = useGuard();
	const saving = useGuard();
	const [proposals, setProposals] = useState<EstimateProposal[]>([]);
	const sheet = view.sheet;
	const tasks = new Map(sheet.features.flatMap((f) => f.tasks.map((x) => [x.id, x] as const)));
	const off = seal?.sealed
		? a.sealed
		: sheet.frozen
			? t.costing.sheet.frozen
			: ids.length === 0
				? a.select
				: undefined;
	const drop = (id: string) => setProposals((all) => all.filter((p) => p.task !== id));
	const ask = () =>
		asking.run(async () => {
			const next = await unwrap(commands.estimateAgentStart(slug, ids, true));
			setProposals((all) => [...all.filter((p) => !ids.includes(p.task)), ...next]);
		});
	const accept = (p: EstimateProposal) =>
		saving.run(async () => {
			// The sheet of the file, not the one of this render: an earlier accept can be in it.
			const { sheet } = await unwrap(commands.estimateGet(slug));
			await act.saveSheet(slug, {
				...sheet,
				features: sheet.features.map((f) => ({
					...f,
					tasks: f.tasks.map((x) => (x.id === p.task ? withProposal(x, p) : x)),
				})),
			});
			drop(p.task);
		});
	// A proposal of a task that left the sheet has no row to enter.
	const shown = proposals.flatMap((p) => {
		const task = tasks.get(p.task);
		return task ? [{ p, task }] : [];
	});
	const days = (n: number | null | undefined) => (n == null ? "—" : figure(n, lang));

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<RightButton
					right="work.edit"
					className="min-h-control"
					busy={asking.busy}
					disabled={off !== undefined}
					reason={off}
					onClick={() => void ask()}
				>
					{a.ask}
				</RightButton>
				{asking.busy ? (
					<Button className="min-h-control" onClick={() => void commands.estimateAgentStop(slug)}>
						{a.stop}
					</Button>
				) : null}
			</div>
			<ErrorNotice error={asking.failure ?? saving.failure} />
			{shown.length > 0 ? (
				<section aria-label={a.proposals} className="rounded-lg border bg-surface-1 shadow-1">
					<ul>
						{shown.map(({ p, task }) => (
							<li
								key={p.task}
								aria-label={task.name}
								className="flex flex-wrap items-start gap-4 border-b p-3 last:border-b-0"
							>
								<div className="min-w-40 flex-1">
									<p className="text-ui font-medium">{task.name}</p>
									<ul className="list-disc pl-4 text-12 text-n-11">
										{p.assumptions.map((x) => (
											<li key={x}>{x}</li>
										))}
									</ul>
								</div>
								<dl className="flex gap-4">
									{(
										[
											[a.best, task.optimistic, p.best],
											[c.likely, task.days ?? view.days[task.id], p.likely],
											[a.worst, task.pessimistic, p.worst],
										] as const
									).map(([label, old, next]) => (
										<div key={label}>
											<dt className="text-12 text-n-11">{label}</dt>
											<dd className="font-mono text-ui">
												<span className="text-n-11">{days(old)}</span> →{" "}
												<span className="font-semibold">{days(next)}</span>
											</dd>
										</div>
									))}
								</dl>
								<div className="flex gap-2">
									<RightButton
										right="work.edit"
										variant="primary"
										className="min-h-control"
										disabled={saving.busy}
										onClick={() => void accept(p)}
									>
										{a.accept}
									</RightButton>
									<Button
										className="min-h-control"
										disabled={saving.busy}
										onClick={() => drop(p.task)}
									>
										{a.discard}
									</Button>
								</div>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</>
	);
}
