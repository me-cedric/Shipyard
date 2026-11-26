import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { useWorkItems } from "@/lib/sync";
import { addDays, memberName, useSheet, useTeam, useWorkActions } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { buttonVariants } from "@/ui/atoms/button";
import { CalendarDaysIcon } from "@/ui/icons";
import { ATTENTION_TINT } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { PageHeader } from "@/ui/molecules/page-header";
import { ATTENTION_FRAME, usePlainDay, usePlanSheet, useProposals } from "./capacity";
import { DatesPage } from "./dates-page";
import { overloaded } from "./proposals";
import { TimelineBars } from "./timeline-bars";
import { PlanExport, usePlanBars, usePlanTitle } from "./timeline-export";

/**
 * Plan / Timeline: the tasks of one sheet on a scale of weeks, from the team and the calendar. Only
 * decisions are stored (REQ-016). The title says when the release ends (`spec:app-redesign#REQ-018`).
 * The search key `page=dates` opens the dates and the days off, with the task of the key `task`.
 */
export function Timeline() {
	const { t } = useI18n();
	const p = t.work.plan;
	const c = t.costing.plan;
	const day = usePlainDay();
	const navigate = useNavigate();
	const search: { page?: unknown; task?: unknown; at?: unknown } = useSearch({ strict: false });
	const { ready, slug, setChosen, plan, blank } = usePlanSheet(t.ui.place.plan);
	const members = useTeam().data?.team.members ?? [];
	const act = useWorkActions();
	const { error, run } = useGuard();
	const tasks = useSheet(slug).data?.sheet;
	const items = useWorkItems({}).data ?? [];
	const bars = usePlanBars(slug);
	const title = usePlanTitle(slug ?? "");
	const proposed = useProposals(plan);
	const rebalance = useRights().gate("work.edit");

	if (blank || !slug || !plan) return blank;
	if (search.page === "dates")
		return (
			<DatesPage
				slug={slug}
				task={typeof search.task === "string" ? search.task : null}
				sheets={ready}
				onSheet={setChosen}
			/>
		);

	const ticketOf = (ref: string) =>
		tasks?.features.flatMap((f) => f.tasks).find((x) => ref.endsWith(`#${x.id}`))?.ticket;
	// The capacity problem is the banner. Plan / People has the load of each person and the proposals.
	const over = overloaded(plan.load.members);
	const warnings = [
		...plan.gantt.bars.filter((b) => !b.member).map((b) => format(c.missing, { name: b.name })),
		...plan.gantt.bars
			.filter((b) => {
				const key = ticketOf(b.task);
				const done = items.find((i) => i.key === key)?.category === "done";
				return b.end < plan.today && !done;
			})
			.map((b) => format(c.late, { name: b.name, day: day(b.end) })),
	];
	const move = (id: string, days: number) => {
		const bar = plan.gantt.bars.find((b) => b.task === id);
		if (!bar) return;
		const mine = plan.decisions.tasks[id] ?? {};
		void run(() =>
			act.saveDecisions({
				...plan.decisions,
				tasks: { ...plan.decisions.tasks, [id]: { ...mine, start: addDays(bar.start, days) } },
			}),
		);
	};
	const counts = [
		{ label: p.tasks, value: bars.length },
		{ label: p.features, value: new Set(bars.map((b) => b.group)).size },
		{ label: t.planPlace.noOwner, value: bars.filter((b) => !b.owner).length },
	];

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={<CalendarDaysIcon size={16} />}
				title={title}
				action={
					<>
						<Link
							to="/plan/timeline"
							search={{ page: "dates" } as never}
							className={buttonVariants()}
						>
							{t.planPlace.calendar}
						</Link>
						<PlanExport slug={slug} />
					</>
				}
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
				{error || proposed.error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error ?? proposed.error}
					</p>
				) : null}
				{over.length > 0 ? (
					<Card
						className={`flex flex-wrap items-center gap-4 px-6 py-5 ${ATTENTION_FRAME}`}
						role="region"
						aria-label={c.capacity}
					>
						<span className="flex -space-x-2">
							{over.slice(0, 3).map((m) => (
								<Avatar
									key={m.handle}
									name={memberName(members, m.handle)}
									className={`size-9 border-2 border-surface-2 ${ATTENTION_TINT}`}
								/>
							))}
						</span>
						<h2 className="flex-[1_1_16rem] text-20 font-semibold text-n-12">
							{over.length === 1
								? format(t.planPlace.tooMuchOne, { name: memberName(members, over[0]?.handle) })
								: format(t.planPlace.tooMuch, { count: over.length })}
						</h2>
						<Link to="/plan/people" className={buttonVariants()}>
							{t.planPlace.show}
						</Link>
						<ConfirmButton
							variant="primary"
							reason={rebalance.reason}
							disabled={proposed.list.length === 0 || rebalance.disabled}
							confirm={t.planPlace.confirmRebalance}
							onConfirm={() => proposed.apply(proposed.list)}
						>
							{t.planPlace.rebalance}
						</ConfirmButton>
					</Card>
				) : null}
				<Card className="shrink-0 px-6 pt-3 pb-6">
					<TimelineBars
						showToday={search.at === "today"}
						bars={bars}
						today={plan.today}
						todayLabel={p.today}
						unstaffed={p.unstaffed}
						barLabel={(b) =>
							format(p.bar, {
								name: b.name,
								member: b.owner ?? p.unstaffed,
								start: day(b.start),
								end: day(b.end),
							})
						}
						milestoneLabel={(name, d) => format(t.work.milestone, { name, day: d })}
						onMove={move}
						onOpen={(id) =>
							void navigate({
								search: (prev: object) => ({ ...prev, page: "dates", task: id }),
							} as never)
						}
					/>
				</Card>
				<div className="flex shrink-0 flex-wrap gap-3.5">
					{counts.map((x) => (
						<Card key={x.label} className="flex flex-[1_1_11rem] flex-col gap-1 p-5">
							<span className="text-13 font-semibold text-n-10">{x.label}</span>
							<span className="text-30 font-semibold text-n-12">{x.value}</span>
						</Card>
					))}
				</div>
				{warnings.length > 0 ? (
					<Card pad className="shrink-0" role="region" aria-label={c.warnings}>
						<h2 className="text-13 font-semibold text-n-10">
							{format(t.planPlace.group, { name: c.warnings, count: warnings.length })}
						</h2>
						<ul className="pt-2 text-n-12">
							{warnings.map((w) => (
								<li key={w}>{w}</li>
							))}
						</ul>
					</Card>
				) : null}
			</div>
		</div>
	);
}
