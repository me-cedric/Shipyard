import { Link } from "@tanstack/react-router";
import { type ReactNode, useId } from "react";
import { useExportRun } from "@/features/reports/export-menu";
import { useGuard } from "@/features/work/guard";
import { HolidayCountry } from "@/features/work/holiday-country";
import { format, useI18n } from "@/lib/i18n";
import { RightButton, useRights } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { type Calendar, type Decisions, isDay, usePlan, useTeam, useWorkActions } from "@/lib/work";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { Segmented } from "@/ui/atoms/segmented";
import { Select } from "@/ui/atoms/select";
import { ChevronRightIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { usePlainDay } from "./capacity";
import { usePlanTitle, usePngItem } from "./timeline-export";

const HEAD = "px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-10";

/** A value row of the design: a medium label on the left, compact controls on the right. */
export function FieldRow({ label, children }: { label: ReactNode; children: ReactNode }) {
	const id = useId();
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<Row className="py-2" render={(props) => <div role="group" aria-labelledby={id} {...props} />}>
			<span id={id} className="min-w-32 flex-1 font-medium">
				{label}
			</span>
			{children}
		</Row>
	);
}

/** A day as a button. The date field of the system lies on it and opens the date picker. */
function DayButton({
	label,
	text,
	value,
	disabled,
	onChange,
}: {
	label: string;
	text: string;
	value: string;
	disabled?: boolean;
	onChange: (value: string) => void;
}) {
	return (
		<span
			className={cn(
				buttonVariants(),
				"relative focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
				disabled && "pointer-events-none opacity-50",
			)}
		>
			{text}
			<input
				type="date"
				aria-label={label}
				disabled={disabled}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onClick={(e) => e.currentTarget.showPicker?.()}
				className="absolute inset-0 size-full cursor-pointer opacity-0"
			/>
		</span>
	);
}

function Alert({ error }: { error: string | null }) {
	return error ? (
		<p role="alert" className="px-6 py-2 text-ui text-danger-text">
			{error}
		</p>
	) : null;
}

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

/** One task: the person, the fixed start and the order. Each change is a decision. */
function TaskCard({ slug, task }: { slug: string; task: string }) {
	const { t } = useI18n();
	const { can } = useRights();
	const p = t.work.plan;
	const d = t.planPlace.dates;
	const plan = usePlan(slug).data;
	const members = useTeam().data?.team.members ?? [];
	const act = useWorkActions();
	const { error, run } = useGuard();
	const plain = usePlainDay();
	const bar = plan?.gantt.bars.find((b) => b.task === task);
	if (!plan || !bar) return null;
	const all = plan.decisions;
	const mine = all.tasks[task] ?? {};
	const save = (next: Decisions) => run(() => act.saveDecisions(next));
	const patch = (change: { start?: string; member?: string }) => {
		const merged = { ...mine, ...change };
		const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v));
		const { [task]: _drop, ...others } = all.tasks;
		return save({
			...all,
			tasks: Object.keys(clean).length ? { ...others, [task]: clean } : others,
		});
	};
	const refs = plan.gantt.bars.map((b) => b.task);
	const order = priority(refs, all.order);
	const shift = (by: -1 | 1) => {
		const at = order.indexOf(task);
		const to = at + by;
		if (to < 0 || to >= order.length) return;
		const next = [...order];
		[next[at], next[to]] = [next[to] as string, next[at] as string];
		// Other sheets keep their entries.
		return save({ ...all, order: [...next, ...all.order.filter((r) => !refs.includes(r))] });
	};
	const edit = can("work.edit");

	return (
		<Card className="py-2">
			<h2 className="px-6 pt-4 pb-2 text-20 font-semibold text-n-12">{bar.name}</h2>
			<FieldRow label={d.who}>
				<Select
					label={d.who}
					disabled={!edit}
					// The person of the decision, else the person that the plan chose.
					value={mine.member ?? bar.member ?? ""}
					placeholder={p.unstaffed}
					onValueChange={(v) => void patch({ member: v })}
					items={members.map((m) => ({ value: m.handle, label: m.name }))}
				/>
				<RightButton
					right="work.edit"
					disabled={!mine.member}
					onClick={() => void patch({ member: "" })}
				>
					{d.chooseForMe}
				</RightButton>
			</FieldRow>
			<FieldRow label={d.start}>
				<span className="w-72 max-w-full">
					<Segmented
						label={d.start}
						value={mine.start ? "fixed" : "auto"}
						onValueChange={(v) => edit && void patch({ start: v === "fixed" ? bar.start : "" })}
						items={[
							{ value: "auto", label: d.auto },
							{ value: "fixed", label: d.fixed },
						]}
					/>
				</span>
			</FieldRow>
			<FieldRow label={d.fixedDay}>
				<DayButton
					label={d.fixedDay}
					text={mine.start ? plain(mine.start) : d.fixedDay}
					disabled={!edit}
					value={mine.start ?? ""}
					onChange={(v) => isDay(v) && void patch({ start: v })}
				/>
				<RightButton
					right="work.edit"
					disabled={!mine.start}
					onClick={() => void patch({ start: "" })}
				>
					{d.clearFixed}
				</RightButton>
			</FieldRow>
			<FieldRow label={p.order}>
				<RightButton right="work.edit" onClick={() => void shift(-1)}>
					{p.earlier}
				</RightButton>
				<RightButton right="work.edit" onClick={() => void shift(1)}>
					{p.later}
				</RightButton>
			</FieldRow>
			<Alert error={error} />
		</Card>
	);
}

/** The working days and the holidays of the plan. */
function CalendarCards({ slug }: { slug: string }) {
	const { t, lang } = useI18n();
	const { can } = useRights();
	const p = t.work.plan;
	const d = t.planPlace.dates;
	const plain = usePlainDay();
	const plan = usePlan(slug).data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	if (!plan) return null;
	const cal = plan.calendar;
	const save = (next: Calendar) => run(() => act.saveCalendar(next));
	const weekday = (iso: string, form: "short" | "long") =>
		new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang, { weekday: form, timeZone: "UTC" });
	return (
		<>
			<Card pad className="flex flex-col gap-3.5">
				<h2 className="text-13 font-semibold text-n-10">{p.workingDays}</h2>
				{/* biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box */}
				<div role="group" aria-label={p.workingDays} className="flex flex-wrap gap-2">
					{[1, 2, 3, 4, 5, 6, 7].map((n) => (
						<Chip
							key={n}
							// 1 January 2024 is a Monday. The name is the visible text.
							className="min-w-14 justify-center"
							disabled={!can("work.edit")}
							selected={cal.workingDays.includes(n)}
							onClick={() =>
								void save({
									...cal,
									workingDays: cal.workingDays.includes(n)
										? cal.workingDays.filter((x) => x !== n)
										: [...cal.workingDays, n].sort(),
								})
							}
						>
							{weekday(`2024-01-0${n}`, "short")}
						</Chip>
					))}
				</div>
			</Card>
			<Card className="py-2">
				<h2 className={HEAD}>{p.holidays}</h2>
				<HolidayCountry row label={d.holidaysOf} />
				{cal.holidays.map((h) => {
					const name = `${weekday(h, "long")} ${plain(h)} ${h.slice(0, 4)}`;
					return (
						<Row key={h}>
							<span className="flex-[1_1_8rem] font-medium">{weekday(h, "long")}</span>
							<span className="text-n-10">
								{plain(h)} {h.slice(0, 4)}
							</span>
							<RightButton
								right="work.edit"
								aria-label={format(d.removeDay, { day: name })}
								onClick={() => void save({ ...cal, holidays: cal.holidays.filter((x) => x !== h) })}
							>
								{t.work.remove}
							</RightButton>
						</Row>
					);
				})}
				<Row>
					<span className="flex-1" />
					<DayButton
						label={d.addHoliday}
						text={d.addHoliday}
						disabled={!can("work.edit")}
						value=""
						onChange={(v) =>
							isDay(v) && void save({ ...cal, holidays: [...new Set([...cal.holidays, v])].sort() })
						}
					/>
				</Row>
				<Alert error={error} />
			</Card>
		</>
	);
}

/** The picture of the timeline and the way to the send. */
function ShareCard({ slug }: { slug: string }) {
	const d = useI18n().t.planPlace.dates;
	const png = usePngItem(slug);
	const { pick, status } = useExportRun();
	return (
		<Card className="py-2">
			<h2 className={HEAD}>{d.share}</h2>
			<FieldRow label={d.picture}>
				<Button onClick={() => void pick(png)}>{d.exportPicture}</Button>
				{status}
			</FieldRow>
			<Row
				render={(props) => <Link to="/plan/people" search={{ page: "send" } as never} {...props} />}
			>
				<span className="flex-1 font-semibold">{d.sendPlan}</span>
				<ChevronRightIcon size={20} />
			</Row>
		</Card>
	);
}

/**
 * Plan / Timeline, dates and days off: the task of the address, the sheet of the plan, the working
 * days, the holidays and the ways to share the plan. A full page with the way back to Timeline.
 */
export function DatesPage({
	slug,
	task,
	sheets,
	onSheet,
}: {
	slug: string;
	task: string | null;
	/** The sheets with a plan, and the choice of one. */
	sheets: { slug: string; name?: string | null }[];
	onSheet: (slug: string) => void;
}) {
	const { t } = useI18n();
	const d = t.planPlace.dates;
	const title = usePlanTitle(slug);
	const column = (children: ReactNode) => (
		<div className="flex min-w-0 flex-[1_1_26rem] flex-col gap-6">{children}</div>
	);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title={title}
				back={
					<BackLink
						label={t.planPlace.views.timeline}
						render={(props) => <Link to="/plan/timeline" {...props} />}
					/>
				}
			/>
			<div className="flex min-h-0 flex-1 flex-wrap content-start items-start gap-6 overflow-y-auto px-4 pt-1 pb-4">
				{column(
					<>
						{task ? <TaskCard key={task} slug={slug} task={task} /> : null}
						<Card className="py-2">
							<h2 className={HEAD}>{d.calendarOf}</h2>
							<FieldRow label={d.sheet}>
								<Select
									label={d.sheet}
									value={slug}
									onValueChange={onSheet}
									items={sheets.map((s) => ({ value: s.slug, label: s.name ?? s.slug }))}
								/>
							</FieldRow>
						</Card>
					</>,
				)}
				{column(
					<>
						<CalendarCards slug={slug} />
						<ShareCard slug={slug} />
					</>,
				)}
			</div>
		</div>
	);
}
