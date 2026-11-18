import { useNavigate, useSearch } from "@tanstack/react-router";
import { NoProject } from "@/features/shell/no-project";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { useDay } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { isoWeekday, memberName, usePlan, useSheets, useTeam, useWorkActions } from "@/lib/work";
import { CalendarDaysIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { type Proposal, proposals, withProposals } from "./proposals";

type PlanView = NonNullable<ReturnType<typeof usePlan>["data"]>;

// The section switch links with no search: the sheet of the last visit stays for Timeline and People.
let last: string | null = null;

/**
 * The sheet of the plan that the person chose, the first ready sheet by default, and its plan.
 * The address holds the choice in the search key `sheet`, as Estimates does.
 */
export function usePlanSheet(title: string) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const active = useActiveProject().data;
	const sheets = useSheets();
	const search: { sheet?: unknown } = useSearch({ strict: false });
	if (typeof search.sheet === "string") last = search.sheet;
	const chosen = last;
	const setChosen = (sheet: string) => {
		last = sheet;
		void navigate({ search: (prev: object) => ({ ...prev, sheet }), replace: true } as never);
	};
	const ready = (sheets.data ?? []).filter((s) => s.state === "ready");
	const slug = chosen && ready.some((s) => s.slug === chosen) ? chosen : (ready[0]?.slug ?? null);
	const planOf = usePlan(slug);
	const plan = planOf.data;
	const icon = <CalendarDaysIcon size={16} />;
	/** What shows in place of the plan: the load, no project, or no ready sheet. */
	const blank =
		active === undefined || sheets.isLoading || (active && planOf.isLoading) ? (
			<Loading title={title} icon={icon} />
		) : active === null ? (
			<NoProject title={title} icon={icon} />
		) : !slug || !plan ? (
			<>
				<PageHeader title={title} icon={icon} />
				<div className="p-4">
					<EmptyState
						title={t.empty.sprint}
						action={{
							label: t.planPlace.views.estimates,
							onClick: () => void navigate({ to: "/plan/estimates" }),
						}}
					/>
				</div>
			</>
		) : null;
	return { ready, slug, setChosen, plan, blank };
}

/** The proposals of the plan, each with Apply. `only` keeps the proposals for one person. */
export function ProposalList({
	plan,
	only,
	all,
}: {
	plan: PlanView;
	only?: string;
	/** Offer one button that applies each proposal. */
	all?: boolean;
}) {
	const { t } = useI18n();
	const p = t.planPlace;
	const day = useDay();
	const members = useTeam().data?.team.members ?? [];
	const act = useWorkActions();
	const { error, run } = useGuard();
	const off = new Set([...plan.calendar.holidays, ...plan.publicHolidays]);
	const list = proposals(
		plan.gantt.bars,
		plan.load.members,
		members,
		(d) => !plan.calendar.workingDays.includes(isoWeekday(d)) || off.has(d),
	).filter((x) => !only || x.from === only);
	if (list.length === 0) return null;
	const apply = (some: Proposal[]) =>
		void run(() => act.saveDecisions(withProposals(plan.decisions, some)));
	const text = (x: Proposal) =>
		x.to
			? format(p.moveTo, {
					task: x.name,
					from: memberName(members, x.from),
					to: memberName(members, x.to),
				})
			: format(p.startsOn, { task: x.name, day: day(x.start ?? "") });
	return (
		<>
			<ul className="flex flex-col gap-2">
				{list.map((x) => (
					<li
						key={x.task}
						className="flex items-center justify-between gap-3 rounded-lg bg-n-2 px-3 py-1 text-ui"
					>
						{text(x)}
						<RightButton
							right="work.edit"
							className="min-h-control"
							aria-label={`${p.apply}: ${text(x)}`}
							onClick={() => apply([x])}
						>
							{p.apply}
						</RightButton>
					</li>
				))}
			</ul>
			{all && list.length > 1 ? (
				<RightButton
					right="work.edit"
					variant="primary"
					className="min-h-control"
					onClick={() => apply(list)}
				>
					{p.rebalance}
				</RightButton>
			) : null}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}
