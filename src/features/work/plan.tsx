import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import {
	addDays,
	type Bar,
	type Calendar,
	type Decisions,
	isDay,
	isoWeekday,
	memberName,
	usePlan,
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
import { Gantt, type GanttBar } from "@/ui/organisms/gantt";
import { ListDetail } from "@/ui/templates/list-detail";
import { ApplyFlow } from "./apply";
import { useGuard } from "./guard";
import { NoProject } from "./no-project";

const AUTO = "@@auto";

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
	const { t } = useI18n();
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
	const ready = (sheets.data ?? []).filter((s) => s.state === "ready");
	const slug = chosen && ready.some((s) => s.slug === chosen) ? chosen : (ready[0]?.slug ?? null);
	const plan = usePlan(slug).data;

	if (active === undefined || sheets.isLoading) return null;
	if (active === null) return <NoProject title={t.tabs.work.plan} />;
	if (!slug || !plan)
		return (
			<ListDetail title={t.tabs.work.plan}>
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
	const bars: GanttBar[] = plan.gantt.bars.map((b: Bar) => ({
		id: b.task,
		name: b.name,
		group: b.feature,
		owner: b.member ? memberName(members, b.member) : undefined,
		start: b.start,
		end: b.end,
		fixed: Boolean(plan.decisions.tasks[b.task]?.start),
	}));
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
					{error ? (
						<p role="alert" className="text-ui text-danger-text">
							{error}
						</p>
					) : null}
					<span className="flex-1" />
					<Button variant="primary" disabled={!ctx?.tracker} onClick={() => setApplying(true)}>
						<ArrowUpTrayIcon size={14} />
						{p.apply}
					</Button>
				</>
			}
		>
			<Gantt
				bars={bars}
				today={plan.today}
				isOff={(d) => !cal.workingDays.includes(isoWeekday(d)) || cal.holidays.includes(d)}
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
			{applying ? <ApplyFlow slugs={[slug]} onClose={() => setApplying(false)} /> : null}
		</ListDetail>
	);
}
