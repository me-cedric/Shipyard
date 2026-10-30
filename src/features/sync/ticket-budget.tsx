import { format, useI18n } from "@/lib/i18n";
import type { WorkItemView_Serialize } from "@/lib/ipc";
import { useTicketLinks } from "@/lib/projects";
import { Badge } from "@/ui/atoms/badge";
import { Progress } from "@/ui/atoms/progress";

const hours = (minutes: number) => String(Math.round(minutes / 6) / 10);

/**
 * The time spent against the estimate of a ticket, and its Legacy link when `tickets.json` names
 * it. Legacy sources: `components/tickets/budget-bar.tsx` and `lib/tickets/budget.ts`.
 */
export function TicketBudget({ item }: { item: WorkItemView_Serialize }) {
	const { t } = useI18n();
	const w = t.workspace.budget;
	const link = (useTicketLinks().data ?? []).find((l) => l.issueKey === item.key);
	const { estimateMinutes: estimate, spentMinutes: spent } = item;
	const budget = estimate != null && estimate > 0 && spent != null ? { estimate, spent } : null;
	if (!(budget || link)) return null;
	return (
		<div className="flex flex-col gap-1">
			{budget ? (
				<>
					<span className="text-12 text-n-11">
						{format(w.used, { used: hours(budget.spent), estimate: hours(budget.estimate) })}
						{budget.spent > budget.estimate
							? ` · ${format(w.over, { n: hours(budget.spent - budget.estimate) })}`
							: ""}
					</span>
					<Progress
						label={format(w.label, { key: item.key })}
						value={Math.min(budget.spent, budget.estimate)}
						max={budget.estimate}
					/>
				</>
			) : null}
			{link ? <Badge className="self-start">{format(w.link, { key: link.key })}</Badge> : null}
		</div>
	);
}
