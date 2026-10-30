import { useQueries } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { type Plan, specsKeys, useBdd, useCapabilities } from "@/lib/specs";
import { lintGherkin } from "@/lib/specs/bdd-lint";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";

/** The lint findings of the plans, then the scenario coverage graph: one bar for each requirement. */
export function PlanChecks({ plans, onOpen }: { plans: Plan[]; onOpen: (path: string) => void }) {
	return (
		<>
			<PlanLint plans={plans} onOpen={onOpen} />
			<CoverageGraph />
		</>
	);
}

function PlanLint({ plans, onOpen }: { plans: Plan[]; onOpen: (path: string) => void }) {
	const { t } = useI18n();
	const b = t.reports.bdd;
	// The same keys as `useFile`: an open plan and the lint share one read.
	const texts = useQueries({
		queries: plans.map((p) => ({
			queryKey: specsKeys.file(p.path),
			queryFn: () => unwrap(commands.specsRead(p.path)),
			retry: false,
			refetchOnWindowFocus: false,
		})),
	});
	const findings = plans.flatMap((p, i) =>
		lintGherkin(texts[i]?.data?.text ?? "").map((f) => ({ ...f, plan: p })),
	);
	if (plans.length === 0) return null;
	return (
		<Panel title={b.title} count={findings.length} flush>
			{findings.length === 0 ? (
				<p role="status" className="px-3 py-2 text-ui text-n-11">
					{b.clean}
				</p>
			) : (
				<ul className="flex flex-col">
					{findings.map((f) => (
						<li key={`${f.plan.path}:${f.line}:${f.rule}`}>
							<button
								type="button"
								onClick={() => onOpen(f.plan.path)}
								className="flex min-h-row w-full items-center gap-3 border-b px-3 text-left text-ui focus-visible:outline-2"
							>
								<span className="min-w-0 flex-1 truncate">
									{format(b.rule[f.rule], { scenario: f.scenario })}
								</span>
								<span className="font-mono text-12 text-n-11">
									{f.plan.title}:{f.line}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

/** The number of scenarios that cite each requirement. A requirement with none shows as a gap. */
function CoverageGraph() {
	const { t } = useI18n();
	const b = t.reports.bdd;
	const { openRef } = useShell();
	const rows = useBdd().data ?? [];
	const caps = useCapabilities().data ?? [];
	const gaps = useQueries({
		queries: caps.map((c) => ({
			queryKey: specsKeys.coverage(c.capability),
			queryFn: () => unwrap(commands.specsCoverage(c.capability)),
		})),
	}).flatMap((q) => q.data ?? []);
	const counts = new Map<string, number>();
	for (const r of rows) for (const ref of r.refs) counts.set(ref, (counts.get(ref) ?? 0) + 1);
	for (const g of gaps) if (!counts.has(g)) counts.set(g, 0);
	const bars = [...counts].sort((a, c) => a[1] - c[1] || a[0].localeCompare(c[0]));
	if (bars.length === 0) return null;
	const max = Math.max(1, ...bars.map(([, n]) => n));
	return (
		<Panel title={b.coverage} count={bars.length} flush>
			<ul className="flex flex-col">
				{bars.map(([ref, n]) => (
					<li
						key={ref}
						aria-label={
							n ? format(b.covered, { name: ref, count: n }) : format(b.uncovered, { name: ref })
						}
						className="flex min-h-row items-center gap-3 border-b px-3"
					>
						<span className="w-64 shrink-0">
							<RefChip refId={ref} state="resolved" onOpen={openRef} />
						</span>
						<span aria-hidden="true" className="h-2 min-w-0 flex-1 rounded-full bg-n-4">
							<span
								className={`block h-2 rounded-full ${n ? "bg-success" : "bg-warning"}`}
								style={{ width: `${Math.max(n ? 4 : 2, (n / max) * 100)}%` }}
							/>
						</span>
						<span aria-hidden="true" className="w-6 text-right font-mono text-12 text-n-11">
							{n}
						</span>
					</li>
				))}
			</ul>
		</Panel>
	);
}
