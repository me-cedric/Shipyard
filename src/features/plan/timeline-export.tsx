import type { ExportItem } from "@/features/reports/export-menu";
import { PageExport } from "@/features/reports/page-export";
import { format, useI18n } from "@/lib/i18n";
import { isoWeekday, memberName, usePlan, useSheet, useTeam, useWorkActions } from "@/lib/work";
import type { GanttBar } from "@/ui/organisms/gantt";
import { usePlainDay, ZOOM, type Zoom } from "./capacity";
import { overloaded } from "./proposals";

/** One bar of the timeline: the bar of the picture, plus the person and whether that person is over. */
export type PlanBar = GanttBar & { handle?: string; over: boolean };

/** The bars of the plan of one sheet, with the name of each owner. */
export function usePlanBars(slug: string | null): PlanBar[] {
	const plan = usePlan(slug).data;
	const members = useTeam().data?.team.members ?? [];
	if (!plan) return [];
	const over = new Set(overloaded(plan.load.members).map((m) => m.handle));
	return plan.gantt.bars.map((b) => ({
		id: b.task,
		name: b.name,
		group: b.feature,
		owner: b.member ? memberName(members, b.member) : undefined,
		handle: b.member ?? undefined,
		over: Boolean(b.member && over.has(b.member)),
		start: b.start,
		end: b.end,
		fixed: Boolean(plan.decisions.tasks[b.task]?.start),
	}));
}

/** The title of Timeline and of its sub-page: the name of the sheet and the day on which its last task ends. */
export function usePlanTitle(slug: string) {
	const { t } = useI18n();
	const day = usePlainDay();
	const name = useSheet(slug).data?.sheet.name || slug;
	const finish = (usePlan(slug).data?.gantt.bars ?? [])
		.map((b) => b.end)
		.sort()
		.at(-1);
	return finish ? format(t.planPlace.ends, { name, day: day(finish) }) : name;
}

/** The export of the timeline as a picture, at the scale `zoom`. */
export function usePngItem(slug: string, zoom: Zoom = "week"): ExportItem {
	const { t, lang } = useI18n();
	const plan = usePlan(slug).data;
	const name = useSheet(slug).data?.sheet.name || slug;
	const bars = usePlanBars(slug);
	const act = useWorkActions();
	const job = async (path: string) => {
		if (!plan) return;
		const off = new Set([...plan.calendar.holidays, ...plan.publicHolidays]);
		const { ganttPng } = await import("@/ui/organisms/gantt-png");
		const bytes = await ganttPng(bars, {
			title: name,
			today: plan.today,
			dayWidth: ZOOM[zoom],
			isOff: (d) => !plan.calendar.workingDays.includes(isoWeekday(d)) || off.has(d),
			lang,
		});
		await act.savePng(path, bytes);
	};
	return { id: "png", label: t.costing.plan.png, save: { name: slug, ext: "png", job } };
}

/** The Export menu of the plan: the picture first, then the files. */
export function PlanExport({ slug, zoom }: { slug: string; zoom?: Zoom }) {
	const png = usePngItem(slug, zoom);
	return <PageExport page="plan" slug={slug} extra={[png]} />;
}
