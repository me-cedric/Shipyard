import { Link } from "@tanstack/react-router";
import { memberWeek, weekStart } from "@/features/work/week-focus";
import { format, useI18n } from "@/lib/i18n";
import { askForm } from "@/lib/shell";
import { memberName, useTeam } from "@/lib/work";
import { Select } from "@/ui/atoms/select";
import { CalendarDaysIcon } from "@/ui/icons";
import { PageHeader } from "@/ui/molecules/page-header";
import { ProposalList, usePlanSheet } from "./capacity";
import { overDays } from "./proposals";

const sum = (n: (number | null)[]) => +n.reduce((a: number, b) => a + (b ?? 0), 0).toFixed(1);

/** Plan / People: each person with the load against the capacity, the tasks, and the proposals for a person who is over (`spec:app-redesign#REQ-018`). */
export function People() {
	const { t } = useI18n();
	const p = t.planPlace;
	const { ready, slug, setChosen, plan, blank } = usePlanSheet(t.ui.place.plan);
	const members = useTeam().data?.team.members ?? [];
	if (blank || !slug || !plan) return blank;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={<CalendarDaysIcon size={16} />}
				title={p.views.people}
				action={
					<Select
						label={t.work.plan.sheet}
						value={slug}
						onValueChange={setChosen}
						items={ready.map((s) => ({ value: s.slug, label: s.name ?? s.slug }))}
					/>
				}
			/>
			<ul className="mx-4 mb-4 rounded-xl border bg-surface-2 shadow-1">
				{plan.load.members.map((m) => {
					const name = memberName(members, m.handle);
					const tasks = plan.gantt.bars.filter((b) => b.member === m.handle);
					const over = overDays(m.days);
					const first = over[0];
					return (
						<li key={m.handle} className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0">
							<div className="flex flex-wrap items-baseline justify-between gap-3">
								<h2 className="text-16 font-semibold text-n-12">
									{format(t.count, { name, count: tasks.length })}
								</h2>
								<span className="font-mono text-12 text-n-11">
									{format(p.load, {
										used: sum(m.days.map((d) => d.used)),
										capacity: sum(m.days.map((d) => d.capacity)),
									})}
								</span>
							</div>
							{first ? (
								// The link opens the member in Crew on the week of the first day over: the capacity is set there.
								<Link
									to="/crew/crew"
									onClick={() =>
										askForm(`member:${memberWeek(m.handle, weekStart(first.day), slug)}`)
									}
									className="flex min-h-control items-center self-start text-ui font-medium underline"
								>
									{format(t.costing.plan.over, { name, count: over.length })}
								</Link>
							) : null}
							<ul className="text-ui text-n-12">
								{tasks.map((b) => (
									<li key={b.task} className="flex justify-between gap-3">
										{b.name}
										<span className="font-mono text-12 text-n-11">
											{b.start} → {b.end}
										</span>
									</li>
								))}
							</ul>
							<ProposalList plan={plan} only={m.handle} />
						</li>
					);
				})}
			</ul>
		</div>
	);
}
