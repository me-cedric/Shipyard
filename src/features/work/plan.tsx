import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageExport } from "@/features/reports/page-export";
import { format, useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { useWorkItems } from "@/lib/sync";
import {
	addDays,
	type Bar,
	type Calendar,
	type Decisions,
	isDay,
	isoWeekday,
	memberName,
	usePlan,
	useSheet,
	useSheets,
	useTeam,
	useWorkActions,
	useWorkContext,
} from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { IconButton } from "@/ui/atoms/icon-button";
import { Caption, Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import {
	ArrowUpTrayIcon,
	CalendarDaysIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	PlusIcon,
	TrashIcon,
	XMarkIcon,
} from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { type Band, Gantt, type GanttBar } from "@/ui/organisms/gantt";
import { ListDetail } from "@/ui/templates/list-detail";
import { ApplyFlow } from "./apply";
import { useGuard } from "./guard";
import { HolidayCountry } from "./holiday-country";
import { NoProject } from "./no-project";

const AUTO = "@@auto";
const ZOOM = { day: 18, week: 6, month: 2 } as const;
type Zoom = keyof typeof ZOOM;
const ratio = (days: { day: string; used: number | null; capacity: number | null }[]): Band =>
	Object.fromEntries(
		days.map((d) => [d.day, (d.used ?? 0) / Math.max(d.capacity ?? 0, 1e-9)] as const),
	);

/** The tasks of a sheet in the order that the plan gives them capacity: the decisions first. */
function priority(refs: string[], order: string[]) {
	const rank = (r: string) => {
		const i = order.indexOf(r);
		return i < 0 ? Number.POSITIVE_INFINITY : i;
	};
	return refs
		.map((r, i) => ({ r, i }))
		.sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
		.map((x) => x.r);
}

/** One bar in the inspector: the member, the fixed start and the order. Each change is a decision. */
function BarDetail({ slug, task }: { slug: string; task: string }) {
	const { t } = useI18n();
	const p = t.work.plan;
	const plan = usePlan(slug).data;
	const members = useTeam().data?.team.members ?? [];
	const act = useWorkActions();
	const { error, run } = useGuard();
	const bar = plan?.gantt.bars.find((b) => b.task === task);
	if (!plan || !bar) return null;
	const d = plan.decisions;
	const mine = d.tasks[task] ?? {};
	const save = (next: Decisions) => run(() => act.saveDecisions(next));
	const patch = (change: { start?: string; member?: string }) => {
		const merged = { ...mine, ...change };
		const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v));
		const { [task]: _drop, ...others } = d.tasks;
		return save({ ...d, tasks: Object.keys(clean).length ? { ...others, [task]: clean } : others });
	};
	const refs = plan.gantt.bars.map((b) => b.task);
	const order = priority(refs, d.order);
	const shift = (by: -1 | 1) => {
		const at = order.indexOf(task);
		const to = at + by;
		if (to < 0 || to >= order.length) return;
		const next = [...order];
		[next[at], next[to]] = [next[to] as string, next[at] as string];
		// Other sheets keep their entries.
		return save({ ...d, order: [...next, ...d.order.filter((r) => !refs.includes(r))] });
	};

	return (
		<div className="flex flex-col gap-3">
			<p className="text-ui font-medium">{bar.name}</p>
			<p className="font-mono text-12 text-n-11">
				{bar.start} → {bar.end}
			</p>
			<Select
				caption
				label={p.member}
				value={mine.member ?? AUTO}
				onValueChange={(v) => void patch({ member: v === AUTO ? "" : v })}
				items={[
					{ value: AUTO, label: p.auto },
					...members.map((m) => ({ value: m.handle, label: m.name })),
				]}
			/>
			<div className="flex items-center gap-2">
				<Input
					caption
					label={p.fixedStart}
					type="date"
					value={mine.start ?? ""}
					onChange={(e) => isDay(e.target.value) && void patch({ start: e.target.value })}
				/>
				<IconButton
					label={p.clearStart}
					disabled={!mine.start}
					onClick={() => void patch({ start: "" })}
				>
					<XMarkIcon size={14} />
				</IconButton>
			</div>
			<Caption label={p.order}>
				<span className="flex items-center gap-1">
					<IconButton label={p.earlier} onClick={() => void shift(-1)}>
						<ChevronUpIcon size={14} />
					</IconButton>
					<IconButton label={p.later} onClick={() => void shift(1)}>
						<ChevronDownIcon size={14} />
					</IconButton>
				</span>
			</Caption>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</div>
	);
}

/** The working days and the public holidays. */
function CalendarForm({ slug }: { slug: string }) {
	const { t, lang } = useI18n();
	const p = t.work.plan;
	const plan = usePlan(slug).data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [day, setDay] = useState("");
	if (!plan) return null;
	const cal = plan.calendar;
	const save = (next: Calendar) => run(() => act.saveCalendar(next));
	return (
		<div className="flex flex-col gap-3">
			<HolidayCountry />
			<fieldset className="flex flex-col">
				<legend className="pb-1 text-12 font-medium text-n-11">{p.workingDays}</legend>
				{[1, 2, 3, 4, 5, 6, 7].map((n) => (
					<Checkbox
						key={n}
						label={new Date(Date.UTC(2024, 0, n)).toLocaleDateString(lang, {
							weekday: "long",
							timeZone: "UTC",
						})}
						checked={cal.workingDays.includes(n)}
						onCheckedChange={(on) =>
							void save({
								...cal,
								workingDays: on
									? [...cal.workingDays, n].sort()
									: cal.workingDays.filter((x) => x !== n),
							})
						}
					/>
				))}
			</fieldset>
			<section className="flex flex-col gap-1">
				<h3 className="text-12 font-medium text-n-11">
					{format(t.count, { name: p.holidays, count: cal.holidays.length })}
				</h3>
				<form
					className="flex items-center gap-1"
					onSubmit={(e) => {
						e.preventDefault();
						if (!isDay(day)) return;
						void save({ ...cal, holidays: [...new Set([...cal.holidays, day])].sort() }).then(() =>
							setDay(""),
						);
					}}
				>
					<Input
						label={p.holiday}
						type="date"
						value={day}
						onChange={(e) => setDay(e.target.value)}
					/>
					<IconButton label={p.addHoliday} type="submit" disabled={!isDay(day)}>
						<PlusIcon size={14} />
					</IconButton>
				</form>
				{cal.holidays.map((h) => (
					<div key={h} className="flex h-row items-center justify-between border-b">
						<span className="font-mono text-12">{h}</span>
						<IconButton
							label={`${t.work.remove} ${h}`}
							onClick={() => void save({ ...cal, holidays: cal.holidays.filter((x) => x !== h) })}
						>
							<TrashIcon size={14} />
						</IconButton>
					</div>
				))}
			</section>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</div>
	);
}

/** Work / Plan: a Gantt from one sheet, the team and the calendar. Only decisions are stored (REQ-016). */
export function Plan() {
	const { t, lang } = useI18n();
	const p = t.work.plan;
	const active = useActiveProject().data;
	const sheets = useSheets();
	const ctx = useWorkContext().data;
	const members = useTeam().data?.team.members ?? [];
	const act = useWorkActions();
	const { openDetail } = useShell();
	const navigate = useNavigate();
	const { error, run } = useGuard();
	const [chosen, setChosen] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [applying, setApplying] = useState(false);
	const [zoom, setZoom] = useState<Zoom>("day");
	const [people, setPeople] = useState(false);
	const ready = (sheets.data ?? []).filter((s) => s.state === "ready");
	const slug = chosen && ready.some((s) => s.slug === chosen) ? chosen : (ready[0]?.slug ?? null);
	const plan = usePlan(slug).data;
	const tasks = useSheet(slug).data?.sheet;
	const items = useWorkItems({}).data ?? [];
	const off = useMemo(
		() => new Set([...(plan?.calendar.holidays ?? []), ...(plan?.publicHolidays ?? [])]),
		[plan],
	);

	if (active === undefined || sheets.isLoading) return null;
	if (active === null) return <NoProject title={t.tabs.work.plan} />;
	if (!slug || !plan)
		return (
			<ListDetail title={t.tabs.work.plan} icon={<CalendarDaysIcon size={16} />}>
				<div className="p-4">
					<EmptyState
						action={{
							label: t.tabs.work.estimates,
							onClick: () => void navigate({ to: "/work/estimates" }),
						}}
					/>
				</div>
			</ListDetail>
		);

	const cal = plan.calendar;
	const c = t.costing.plan;
	const all: GanttBar[] = plan.gantt.bars.map((b: Bar) => ({
		id: b.task,
		name: b.name,
		group: b.feature,
		owner: b.member ? memberName(members, b.member) : undefined,
		start: b.start,
		end: b.end,
		fixed: Boolean(plan.decisions.tasks[b.task]?.start),
	}));
	// The resource view groups the bars by member, the bars without a member last.
	const bars = people
		? all
				.map((b) => ({ ...b, group: b.owner ?? p.unstaffed }))
				.sort((a, b) => Number(!a.owner) - Number(!b.owner) || a.group.localeCompare(b.group))
		: all;
	const loads = new Map(
		plan.load.members.map((m) => [memberName(members, m.handle), ratio(m.days)] as const),
	);
	const isOff = (d: string) => !cal.workingDays.includes(isoWeekday(d)) || off.has(d);
	const ticketOf = (ref: string) =>
		tasks?.features.flatMap((f) => f.tasks).find((x) => ref.endsWith(`#${x.id}`))?.ticket;
	const warnings = [
		...plan.load.members.flatMap((m) => {
			const count = m.days.filter((d) => (d.used ?? 0) > (d.capacity ?? 0) + 1e-6).length;
			return count ? [format(c.over, { name: memberName(members, m.handle), count })] : [];
		}),
		...plan.gantt.bars.filter((b) => !b.member).map((b) => format(c.missing, { name: b.name })),
		...plan.gantt.bars
			.filter((b) => {
				const key = ticketOf(b.task);
				const done = items.find((i) => i.key === key)?.category === "done";
				return b.end < plan.today && !done;
			})
			.map((b) => format(c.late, { name: b.name, day: b.end })),
	];
	const png = async (path: string) => {
		const { ganttPng } = await import("@/ui/organisms/gantt-png");
		const bytes = await ganttPng(bars, {
			title: tasks?.name || slug,
			today: plan.today,
			dayWidth: ZOOM[zoom],
			isOff,
			lang,
		});
		await act.savePng(path, bytes);
	};
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

	return (
		<ListDetail
			title={t.tabs.work.plan}
			icon={<CalendarDaysIcon size={16} />}
			count={bars.length}
			action={
				<Button variant="primary" disabled={!ctx?.tracker} onClick={() => setApplying(true)}>
					<ArrowUpTrayIcon size={14} />
					{p.apply}
				</Button>
			}
			toolbar={
				<>
					<Select
						label={p.sheet}
						value={slug}
						onValueChange={setChosen}
						items={ready.map((s) => ({ value: s.slug, label: s.name ?? s.slug }))}
					/>
					<IconButton
						label={p.calendar}
						onClick={() => openDetail(p.calendar, <CalendarForm key="calendar" slug={slug} />)}
					>
						<CalendarDaysIcon size={14} />
					</IconButton>
					<ViewTabs
						label={c.zoom}
						value={zoom}
						onValueChange={setZoom}
						tabs={(["day", "week", "month"] as const).map((z) => ({ value: z, label: c[z] }))}
					/>
					<ViewTabs
						label={t.tabs.work.plan}
						value={people ? "people" : "tasks"}
						onValueChange={(v) => setPeople(v === "people")}
						tabs={[
							{ value: "tasks", label: c.tasks },
							{ value: "people", label: c.people },
						]}
					/>
					<PageExport
						page="plan"
						slug={slug}
						extra={[{ id: "png", label: c.png, save: { name: slug, ext: "png", job: png } }]}
					/>
					{error ? (
						<p role="alert" className="text-ui text-danger-text">
							{error}
						</p>
					) : null}
				</>
			}
		>
			<StatStrip
				className="px-4 pb-3"
				items={[
					{ label: p.tasks, value: String(bars.length), tone: "accent" },
					{
						label: p.features,
						value: String(new Set(bars.map((b) => b.group)).size),
						tone: "info",
					},
					{
						label: p.unstaffed,
						value: String(bars.filter((b) => !b.owner).length),
						tone: bars.some((b) => !b.owner) ? "warning" : "success",
					},
					{
						label: p.finish,
						value:
							bars
								.map((b) => b.end)
								.sort()
								.at(-1) ?? "-",
						tone: "success",
					},
				]}
			/>
			{warnings.length > 0 ? (
				<section
					aria-label={c.warnings}
					className="mx-4 mb-3 max-h-28 overflow-auto rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2"
				>
					<h2 className="text-12 font-medium text-warning-text">
						{format(t.count, { name: c.warnings, count: warnings.length })}
					</h2>
					<ul className="text-ui text-n-12">
						{warnings.map((w) => (
							<li key={w}>{w}</li>
						))}
					</ul>
				</section>
			) : null}
			<div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1">
				<Gantt
					key={`${zoom}-${people}`}
					bars={bars}
					dayWidth={ZOOM[zoom]}
					band={ratio(plan.load.team)}
					bandLabel={c.capacity}
					groupBand={people ? (g) => loads.get(g) : undefined}
					milestoneLabel={(name, day) => format(t.work.milestone, { name, day })}
					today={plan.today}
					isOff={isOff}
					selected={selected}
					todayLabel={p.today}
					barLabel={(b) =>
						format(p.bar, {
							name: b.name,
							member: b.owner ?? p.unstaffed,
							start: b.start,
							end: b.end,
						})
					}
					onMove={move}
					onOpen={(id) => {
						setSelected(id);
						openDetail(
							bars.find((b) => b.id === id)?.name ?? p.bar,
							<BarDetail key={id} slug={slug} task={id} />,
						);
					}}
				/>
			</div>
			{applying ? <ApplyFlow slugs={[slug]} onClose={() => setApplying(false)} /> : null}
		</ListDetail>
	);
}
