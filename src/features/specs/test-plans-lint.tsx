import { useQueries } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { type Plan, specsKeys } from "@/lib/specs";
import { lintGherkin } from "@/lib/specs/bdd-lint";
import { Panel } from "@/ui/molecules/panel";

/** The lint findings of the plans. */
export function PlanLint({ plans, onOpen }: { plans: Plan[]; onOpen: (path: string) => void }) {
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
