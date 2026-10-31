import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { type Requirement, useRequirements, useSpecsActions } from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { PlusIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";

const ORDER = ["fail", "blocked", "partial", "not-covered", "pass"] as const;
const BADGE = {
	pass: "success",
	fail: "danger",
	partial: "warning",
	blocked: "warning",
	"not-covered": "neutral",
} as const;

/** The verdict that matters most: a failure shows before a pass. */
const worst = (r: Requirement) =>
	ORDER.find((v) => r.scenarios.some((s) => s.verdict === v)) ?? "not-covered";

/**
 * Each requirement of the specs with the scenarios that cite it. A capability with a requirement
 * that no scenario cites, and that holds the text of a scenario, has one button: it adds one
 * scenario with the steps of that text for each of them to the plan of the capability and opens
 * the plan. A requirement with no such text gets none: the button does not show for it.
 */
export function RequirementsView({ onOpen }: { onOpen: (path: string) => void }) {
	const { t } = useI18n();
	const p = t.review.plans;
	const { openRef } = useShell();
	const act = useSpecsActions();
	const rows = useRequirements().data ?? [];
	const [failure, setFailure] = useState<unknown>(null);
	if (rows.length === 0) return null;
	const caps = [...new Set(rows.map((r) => r.capability))];
	const generate = async (cap: string) => {
		try {
			setFailure(null);
			onOpen((await act.generatePlan(cap)).path);
		} catch (e) {
			setFailure(e);
		}
	};
	return (
		<Panel title={p.requirements} count={rows.length} bodyClassName="gap-3 p-3">
			<ErrorNotice error={failure} />
			{caps.map((cap) => {
				const list = rows.filter((r) => r.capability === cap);
				return (
					<section
						key={cap}
						aria-label={`${p.requirements}: ${cap}`}
						className="flex flex-col gap-1"
					>
						<div className="flex items-center gap-2">
							<h3 className="min-w-0 flex-1 text-12 font-medium text-n-11">
								{format(t.count, { name: cap, count: list.length })}
							</h3>
							{list.some((r) => r.scenarios.length === 0 && r.detailed) ? (
								<Button
									variant="ghost"
									aria-label={format(p.generateName, { name: cap })}
									onClick={() => void generate(cap)}
								>
									<PlusIcon size={14} />
									{p.generate}
								</Button>
							) : null}
						</div>
						<ul className="flex flex-col">
							{list.map((r) => (
								<li
									key={r.reference}
									className="flex min-h-row items-center gap-3 border-b text-ui"
								>
									<RefChip refId={r.reference} state="resolved" onOpen={openRef} />
									<span className="min-w-0 flex-1 truncate">{r.title}</span>
									{r.scenarios.length ? (
										<>
											<span className="text-12 text-n-11">
												{format(p.scenarios, { count: r.scenarios.length })}
											</span>
											<Badge variant={BADGE[worst(r) as keyof typeof BADGE]}>
												{t.specs.verdict[worst(r) as keyof typeof t.specs.verdict]}
											</Badge>
										</>
									) : (
										<Badge variant="warning">{p.noScenario}</Badge>
									)}
								</li>
							))}
						</ul>
					</section>
				);
			})}
		</Panel>
	);
}
