import { useNavigate, useSearch } from "@tanstack/react-router";
import { NoProject } from "@/features/shell/no-project";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { dateLocale } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import {
	isDay,
	isoWeekday,
	memberName,
	usePlan,
	useSheets,
	useTeam,
	useWorkActions,
} from "@/lib/work";
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
							label: t.planPlace.openEstimates,
							onClick: () => void navigate({ to: "/plan/estimates" }),
						}}
					/>
				</div>
			</>
		) : null;
	return { ready, slug, setChosen, plan, blank };
}

/** The pixels of one day in the picture of the timeline, for each scale. */
export const ZOOM = { day: 18, week: 6, month: 2 } as const;
export type Zoom = keyof typeof ZOOM;

export { ATTENTION_FRAME } from "@/ui/molecules/attention-card";

export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** A day in plain form, in the language of the person: "17 Nov". */
export function usePlainDay() {
	const { lang } = useI18n();
	// The English of the app puts the day first, as the design does.
	return (day: string) =>
		isDay(day)
			? new Date(`${day}T00:00:00Z`).toLocaleDateString(dateLocale(lang), {
					day: "numeric",
					month: "short",
					timeZone: "UTC",
				})
			: day;
}

/** The proposals of the plan, the sentence of each one, and the action that applies some of them. */
export function useProposals(plan: PlanView | undefined) {
	const p = useI18n().t.planPlace;
	const day = usePlainDay();
	const members = useTeam().data?.team.members ?? [];
	const act = useWorkActions();
	const { failure, run } = useGuard();
	if (!plan) {
		const none = (_: Proposal) => "";
		return { list: [] as Proposal[], rest: none, text: none, apply: () => undefined, failure };
	}
	const off = new Set([...plan.calendar.holidays, ...plan.publicHolidays]);
	const list = proposals(
		plan.gantt.bars,
		plan.load.members,
		members,
		(d) => !plan.calendar.workingDays.includes(isoWeekday(d)) || off.has(d),
	);
	const apply = (some: Proposal[]) =>
		void run(() => act.saveDecisions(withProposals(plan.decisions, some)));
	/** The task and what happens to it: the page shows the task in bold. */
	const rest = (x: Proposal) =>
		x.to
			? format(p.moveTo, {
					from: firstName(memberName(members, x.from)),
					to: firstName(memberName(members, x.to)),
				})
			: format(p.startsOn, { day: day(x.start ?? "") });
	return { list, rest, text: (x: Proposal) => `${x.name} ${rest(x)}`, apply, failure };
}
