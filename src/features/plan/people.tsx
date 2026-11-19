import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { memberWeek, weekStart } from "@/features/work/week-focus";
import { format, useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { askForm } from "@/lib/shell";
import { addDays, memberName, useTeam, useWorkContext } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Segmented } from "@/ui/atoms/segmented";
import { Select } from "@/ui/atoms/select";
import { CalendarDaysIcon, ChevronRightIcon } from "@/ui/icons";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { firstName, usePlainDay, usePlanSheet, useProposals, type Zoom } from "./capacity";
import { overDays, overloaded } from "./proposals";
import { SendPage } from "./send-page";
import { PlanExport } from "./timeline-export";

const sum = (n: (number | null)[]) => +n.reduce((a: number, b) => a + (b ?? 0), 0).toFixed(1);
const ZOOMS = ["day", "week", "month"] as const;

/**
 * Plan / People: the load of each person against the capacity, and the proposals of the planner
 * for the people who are over (`spec:app-redesign#REQ-018`). The search key `page=send` opens the
 * send to the issue tracker.
 */
export function People() {
	const { t, lang } = useI18n();
	const p = t.planPlace;
	const c = t.costing.plan;
	const navigate = useNavigate();
	const search: { page?: unknown } = useSearch({ strict: false });
	const { ready, slug, setChosen, plan, blank } = usePlanSheet(t.ui.place.plan);
	const members = useTeam().data?.team.members ?? [];
	const ctx = useWorkContext().data;
	const day = usePlainDay();
	const [zoom, setZoom] = useState<Zoom>("week");
	const proposed = useProposals(plan);
	if (blank || !slug || !plan) return blank;
	if (search.page === "send") return <SendPage slug={slug} />;

	const over = overloaded(plan.load.members);
	/** The block of a day: the day, its week or its month. */
	const period = (d: string) =>
		zoom === "day" ? d : zoom === "week" ? weekStart(d) : d.slice(0, 7);
	const keys = [
		...new Set(plan.load.members.flatMap((m) => m.days.map((d) => period(d.day)))),
	].sort();
	const real = keys.length;
	// Four weeks or more, as the design shows. The added weeks are empty and carry no label.
	while (zoom === "week" && keys.length > 0 && keys.length < 4)
		keys.push(addDays(keys[keys.length - 1] as string, 7));
	const periods = keys.map((key, i) => ({
		pad: i >= real,
		key,
		name:
			zoom === "month"
				? new Date(`${key}-01T00:00:00Z`).toLocaleDateString(lang, {
						month: "short",
						timeZone: "UTC",
					})
				: day(key),
	}));
	const columns = { gridTemplateColumns: `repeat(${periods.length}, minmax(2.5rem, 1fr))` };

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={<CalendarDaysIcon size={16} />}
				title={
					over.length > 1
						? format(p.tooMuch, { count: over.length })
						: over[0]
							? format(p.tooMuchOne, { name: firstName(memberName(members, over[0].handle)) })
							: p.views.people
				}
			/>
			<div className="flex shrink-0 flex-wrap items-center gap-4 px-4 pb-6">
				<Select
					label={t.work.plan.sheet}
					value={slug}
					onValueChange={setChosen}
					items={ready.map((s) => ({ value: s.slug, label: s.name ?? s.slug }))}
				/>
				<span>
					<Segmented
						label={c.zoom}
						value={zoom}
						onValueChange={setZoom}
						items={ZOOMS.map((z) => ({ value: z, label: c[z] }))}
					/>
				</span>
				<span className="flex-1" />
				<PlanExport slug={slug} zoom={zoom} />
				<RightButton
					right="work.edit"
					disabled={!ctx?.tracker}
					reason={ctx?.tracker ? undefined : t.work.noTracker}
					onClick={() =>
						void navigate({ search: (prev: object) => ({ ...prev, page: "send" }) } as never)
					}
				>
					{p.send}
				</RightButton>
			</div>
			<div className="flex min-h-0 flex-1 flex-wrap content-start items-start gap-6 overflow-y-auto px-4 pb-4">
				<Card className="flex-[3_1_32rem] overflow-x-auto px-6 py-2">
					<h2 className="sr-only">{c.capacity}</h2>
					<div className="min-w-140">
						<div className="flex min-h-control items-center gap-3 border-b border-n-6">
							<span className="w-50 shrink-0" />
							<div className="grid flex-1 gap-2" style={columns}>
								{periods.map((x) => (
									<span key={x.key} className="truncate text-13 font-semibold text-n-10">
										{x.name}
									</span>
								))}
							</div>
						</div>
						{[...plan.load.members]
							.sort((a, b) =>
								firstName(memberName(members, a.handle)).localeCompare(
									firstName(memberName(members, b.handle)),
								),
							)
							.map((m) => {
								const name = memberName(members, m.handle);
								const first = overDays(m.days)[0];
								const total = format(p.load, {
									used: sum(m.days.map((d) => d.used)),
									capacity: sum(m.days.map((d) => d.capacity)),
								});
								return (
									<div
										key={m.handle}
										className="flex min-h-18 items-center gap-3 [&+&]:border-t [&+&]:border-n-6"
									>
										<span
											className="flex w-50 shrink-0 items-center gap-3 font-semibold"
											title={total}
										>
											<Avatar name={name} />
											{first ? (
												// The link opens the member in Crew on the week of the first day over: the capacity is set there.
												<Link
													to="/crew/crew"
													onClick={() =>
														askForm(`member:${memberWeek(m.handle, weekStart(first.day), slug)}`)
													}
													aria-label={format(c.over, { name, count: overDays(m.days).length })}
													className="flex min-h-control items-center text-n-12"
												>
													{firstName(name)}
												</Link>
											) : (
												firstName(name)
											)}
										</span>
										<div className="grid flex-1 gap-2" style={columns}>
											{periods.map((x) => {
												if (x.pad)
													return <div key={x.key} className="h-10 rounded-[10px] bg-n-3" />;
												const days = m.days.filter((d) => period(d.day) === x.key);
												const used = sum(days.map((d) => d.used));
												const capacity = sum(days.map((d) => d.capacity));
												const isOver = overDays(days).length > 0;
												const label = format(p.people.loadOf, {
													period: zoom === "week" ? format(p.week, { day: x.name }) : x.name,
													load: format(p.load, { used, capacity }),
												});
												return (
													<div
														key={x.key}
														role="img"
														aria-label={label}
														title={label}
														className={`flex h-10 items-end overflow-hidden rounded-[10px] ${isOver ? "bg-attention-subtle" : "bg-n-3"}`}
													>
														<i
															className={`block w-full ${isOver ? "bg-attention-strong" : "bg-accent/45"}`}
															style={{
																height: `${Math.min(1, used / Math.max(capacity, 1e-9)) * 100}%`,
															}}
														/>
													</div>
												);
											})}
										</div>
									</div>
								);
							})}
					</div>
				</Card>
				<div className="flex min-w-0 flex-[2_1_19rem] flex-col gap-3.5">
					{proposed.list.length > 0 ? (
						<AttentionCard who={p.planner} title={p.people.proposes}>
							{proposed.list.map((x) => (
								<div
									key={x.task}
									className="flex flex-wrap items-center gap-2.5 rounded-[14px] bg-n-2 p-3.5"
								>
									<span className="flex-[1_1_11rem]">
										<span className="font-semibold">{x.name}</span> {proposed.rest(x)}
									</span>
									<RightButton
										right="work.edit"
										aria-label={`${p.apply}: ${proposed.text(x)}`}
										onClick={() => proposed.apply([x])}
									>
										{p.apply}
									</RightButton>
								</div>
							))}
							{proposed.list.length > 1 ? (
								<RightButton
									right="work.edit"
									variant="primary"
									onClick={() => proposed.apply(proposed.list)}
								>
									{proposed.list.length === 2 ? p.people.applyBoth : p.people.applyAll}
								</RightButton>
							) : null}
							{proposed.error ? (
								<p role="alert" className="text-ui text-danger-text">
									{proposed.error}
								</p>
							) : null}
						</AttentionCard>
					) : null}
					<Card className="py-2">
						<Row
							render={(props) => (
								<Link to="/plan/timeline" search={{ page: "dates" } as never} {...props} />
							)}
						>
							<span className="flex-1 font-semibold">{p.people.daysOff}</span>
							<ChevronRightIcon size={20} />
						</Row>
						<Row
							render={(props) => (
								<Link
									to="/crew/crew"
									search={{ member: (over[0] ?? plan.load.members[0])?.handle } as never}
									{...props}
								/>
							)}
						>
							<span className="flex-1 font-semibold">{p.people.hoursEach}</span>
							<ChevronRightIcon size={20} />
						</Row>
					</Card>
				</div>
			</div>
		</div>
	);
}
