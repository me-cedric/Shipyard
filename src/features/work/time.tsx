import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import type { TimeState } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { useWorkItems } from "@/lib/sync";
import {
	addDays,
	addMonths,
	formatMinutes,
	isoWeekday,
	monthLabel,
	parseDuration,
	type TimeRow,
	useTeam,
	useTimeView,
	useWorkActions,
	useWorkContext,
} from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Panel } from "@/ui/molecules/panel";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { useGuard } from "./guard";
import { NoProject } from "./no-project";

const STATE_ORDER: TimeState[] = ["to-send", "in-tracker", "only-in-tracker"];
const DOT: Record<TimeState, Status> = {
	"to-send": "warning",
	"in-tracker": "success",
	"only-in-tracker": "info",
};

type Line = {
	id: string;
	state: TimeState;
	day: string;
	ticket: string;
	note: string;
	/** The local duration, or the tracker's for a row that only the tracker has. */
	minutes: number;
	/** The tracker duration, when it differs from the local one. */
	tracker: number | null;
	lost: boolean;
	entryId: string | null;
};

const firstLine = (s: string) => s.split("\n")[0] ?? "";

/** The weeks of a month, Monday first: each cell is a day of the month or null. */
export function monthWeeks(month: string): (string | null)[][] {
	const first = `${month}-01`;
	const cells: (string | null)[] = Array(isoWeekday(first) - 1).fill(null);
	for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
	while (cells.length % 7) cells.push(null);
	return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/** The logged hours of each day of the month, as a heatmap: the more hours, the stronger the accent. */
function Heatmap({ month, lines, title }: { month: string; lines: Line[]; title: string }) {
	const { t, lang } = useI18n();
	const total = new Map<string, number>();
	for (const l of lines) if (l.day) total.set(l.day, (total.get(l.day) ?? 0) + l.minutes);
	const max = Math.max(480, ...total.values());
	const weeks = monthWeeks(month);
	const names = (weeks[1] ?? weeks[0] ?? []).map((d) =>
		d
			? new Date(`${d}T00:00:00Z`).toLocaleDateString(lang, { weekday: "narrow", timeZone: "UTC" })
			: "",
	);
	return (
		<Panel title={title} className="self-start">
			<table className="w-full border-separate border-spacing-1 text-center">
				<thead>
					<tr>
						{names.map((n, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: seven fixed weekdays
							<th key={i} scope="col" className="text-11 font-medium text-n-10">
								{n}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{weeks.map((w) => (
						<tr key={w.find(Boolean) ?? ""}>
							{w.map((d, i) => {
								const m = d ? (total.get(d) ?? 0) : 0;
								return (
									<td
										// biome-ignore lint/suspicious/noArrayIndexKey: seven fixed weekdays
										key={i}
										className="h-11 rounded-md p-0 align-middle"
										style={
											d
												? {
														background: `color-mix(in oklch, var(--accent) ${m ? 18 + Math.round((m / max) * 62) : 0}%, var(--n-3))`,
														boxShadow: m >= max ? "var(--accent-glow)" : undefined,
													}
												: undefined
										}
									>
										{d ? (
											<span className="flex flex-col leading-4">
												<span className="text-11 text-n-11">{Number(d.slice(8))}</span>
												<span className="font-mono text-11 text-n-12">
													{m ? format(t.work.hoursShort, { hours: +(m / 60).toFixed(1) }) : ""}
												</span>
											</span>
										) : null}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</Panel>
	);
}

/** Work / Time: the entries of one member and month. A send is one click on one entry (REQ-020 to REQ-024). */
export function Time() {
	const { t, lang } = useI18n();
	const e = t.work.time;
	const active = useActiveProject().data;
	const ctx = useWorkContext().data;
	const members = useTeam().data?.team.members ?? [];
	const items = useWorkItems({}).data ?? [];
	const act = useWorkActions();
	const { error, run, setError } = useGuard();
	const [member, setMember] = useState<string | null>(null);
	const [month, setMonth] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const [reduce, setReduce] = useState(false);
	/** The entry that goes to the tracker now. One send at a time: a second click waits for it. */
	const [sending, setSending] = useState<string | null>(null);
	const sendingNow = useRef(false);
	const [fetched, setFetched] = useState<Record<string, TimeRow[]>>({});
	const [form, setForm] = useState({ day: "", duration: "", ticket: "", note: "" });
	const shownMonth = month ?? ctx?.today.slice(0, 7) ?? "";
	const view = useTimeView(member, shownMonth);
	const data = view.data;
	const handle = data?.member ?? member;

	const lines = useMemo<Line[]>(() => {
		if (!data) return [];
		const tickets = new Set(Object.keys(fetched));
		const toLine = (r: TimeRow, ticket: string): Line => ({
			id: r.entry?.id ?? `log:${r.log?.id}`,
			state: r.state,
			day: r.entry?.day ?? "",
			ticket: r.entry?.ticket ?? ticket,
			note: firstLine(r.entry?.note ?? r.log?.note ?? ""),
			minutes: r.entry?.minutes ?? r.log?.minutes ?? 0,
			tracker: r.differs && r.log ? r.log.minutes : null,
			lost: r.lostReceipt,
			entryId: r.entry?.id ?? null,
		});
		const local = data.rows
			.filter((r) => !(r.entry?.ticket && tickets.has(r.entry.ticket)))
			.map((r) => toLine(r, r.entry?.ticket ?? ""));
		const remote = Object.entries(fetched).flatMap(([ticket, rows]) =>
			rows
				.filter((r) => !r.entry || r.entry.day.startsWith(data.month))
				.map((r) => toLine(r, ticket)),
		);
		return [...local, ...remote].sort(
			(a, b) =>
				STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
				a.day.localeCompare(b.day) ||
				a.id.localeCompare(b.id),
		);
	}, [data, fetched]);

	const columns = useMemo<ColumnDef<Line>[]>(
		() => [
			{
				id: "state",
				header: "",
				meta: { width: "1rem" },
				cell: ({ row }) => (
					<StatusDot status={DOT[row.original.state]} label={e.state[row.original.state]} />
				),
			},
			{
				id: "day",
				header: e.day,
				meta: { width: "6.5rem" },
				cell: ({ row }) => <span className="font-mono text-11">{row.original.day}</span>,
			},
			{
				id: "ticket",
				header: e.ticket,
				meta: { width: "6rem" },
				cell: ({ row }) => <span className="font-mono text-11">{row.original.ticket}</span>,
			},
			{ id: "note", header: e.note, cell: ({ row }) => row.original.note },
			{
				id: "duration",
				header: e.duration,
				meta: { width: "9rem", numeric: true },
				cell: ({ row }) => (
					<span className="flex items-center justify-end gap-1.5">
						{row.original.tracker !== null ? (
							<>
								<StatusDot status="warning" label={e.differs} className="size-2" />
								{format(e.trackerValue, { value: formatMinutes(row.original.tracker) })}
								<span aria-hidden="true">/</span>
							</>
						) : null}
						{formatMinutes(row.original.minutes)}
					</span>
				),
			},
			{
				id: "action",
				header: "",
				meta: { width: "7.5rem" },
				cell: ({ row }) => {
					const r = row.original;
					if (!r.entryId || (r.state !== "to-send" && !r.lost)) return null;
					return (
						<Button
							variant="ghost"
							disabled={!data?.canSend || !r.ticket || sending !== null}
							aria-label={format(r.lost ? e.storeReceipt : e.sendEntry, {
								day: r.day,
								ticket: r.ticket,
							})}
							onClick={() => {
								if (sendingNow.current) return;
								sendingNow.current = true;
								setSending(r.entryId);
								void run(async () => {
									await act.sendTime(handle, r.day, r.entryId ?? "", reduce);
									setFetched({});
								}).finally(() => {
									sendingNow.current = false;
									setSending(null);
								});
							}}
						>
							{r.lost ? e.storeReceipt : e.send}
						</Button>
					);
				},
			},
		],
		[e, data?.canSend, handle, reduce, act, run, sending],
	);

	if (active === undefined) return null;
	if (active === null) return <NoProject title={t.tabs.work.time} />;
	if (!ctx) return null;

	const submit = async (ev: React.FormEvent) => {
		ev.preventDefault();
		const minutes = parseDuration(form.duration);
		if (minutes === null) return setError(e.badDuration);
		const day = form.day || ctx.today;
		const ok = await run(async () => {
			await act.addTime(handle, day, minutes, form.note, form.ticket.trim() || null);
			setFetched({});
		});
		if (ok) {
			setForm({ day: "", duration: "", ticket: "", note: "" });
			setAdding(false);
			setMonth(day.slice(0, 7));
		}
	};
	const fetchAll = () =>
		run(async () => {
			const tickets = [
				...new Set((data?.rows ?? []).flatMap((r) => (r.entry?.ticket ? [r.entry.ticket] : []))),
			];
			const next: Record<string, TimeRow[]> = {};
			for (const ticket of tickets) next[ticket] = await act.fetchTime(handle, ticket);
			setFetched(next);
		});

	return (
		<ListDetail
			title={t.tabs.work.time}
			icon={<ClockIcon size={16} />}
			count={lines.length}
			action={
				adding ? null : (
					<Button variant="primary" disabled={!data} onClick={() => setAdding(true)}>
						<PlusIcon size={14} />
						{e.add}
					</Button>
				)
			}
			toolbar={
				<>
					<IconButton label={e.previous} onClick={() => setMonth(addMonths(shownMonth, -1))}>
						<ChevronLeftIcon size={14} />
					</IconButton>
					<span className="min-w-28 text-center text-ui font-medium">
						{monthLabel(shownMonth, lang)}
					</span>
					<IconButton label={e.next} onClick={() => setMonth(addMonths(shownMonth, 1))}>
						<ChevronRightIcon size={14} />
					</IconButton>
					<Select
						label={e.member}
						value={handle ?? ""}
						onValueChange={setMember}
						items={members.map((m) => ({ value: m.handle, label: m.name }))}
					/>
					<IconButton label={e.fetch} disabled={!data} onClick={() => void fetchAll()}>
						<ArrowPathIcon size={14} />
					</IconButton>
					<Checkbox label={e.reduce} checked={reduce} onCheckedChange={setReduce} />
					<span className="flex-1" />
					{data && !data.canSend ? (
						<span className="text-12 text-n-11">
							{format(t.work.missing, { name: t.connections.flag.timeTracking })}
						</span>
					) : null}
				</>
			}
		>
			{adding ? (
				<form
					onSubmit={(ev) => void submit(ev)}
					onKeyDown={(ev) => ev.key === "Escape" && setAdding(false)}
					className="flex flex-wrap items-end gap-2 border-b px-3 py-2"
				>
					<Input
						caption
						label={e.day}
						type="date"
						value={form.day || ctx.today}
						onChange={(ev) => setForm({ ...form, day: ev.target.value })}
						className="w-36"
						autoFocus
					/>
					<Input
						caption
						label={e.duration}
						value={form.duration}
						onChange={(ev) => setForm({ ...form, duration: ev.target.value })}
						className="w-24 font-mono"
					/>
					<Input
						caption
						label={e.ticket}
						list="time-tickets"
						value={form.ticket}
						onChange={(ev) => setForm({ ...form, ticket: ev.target.value })}
						className="w-32 font-mono"
					/>
					<datalist id="time-tickets">
						{items.map((i) => (
							<option key={i.key} value={i.key} />
						))}
					</datalist>
					<span className="min-w-40 flex-1">
						<Input
							caption
							label={e.note}
							value={form.note}
							onChange={(ev) => setForm({ ...form, note: ev.target.value })}
						/>
					</span>
					<Button type="submit" variant="primary">
						{e.add}
					</Button>
					<Button variant="ghost" onClick={() => setAdding(false)}>
						{t.sync.backlog.cancel}
					</Button>
				</form>
			) : null}
			{error || view.error ? (
				<p role="alert" className="px-3 py-1 text-ui text-danger-text">
					{error ?? (view.error instanceof Error ? view.error.message : String(view.error))}
				</p>
			) : null}
			{data && lines.length === 0 ? (
				<div className="p-4">
					<EmptyState
						action={{ label: e.add, icon: <PlusIcon size={14} />, onClick: () => setAdding(true) }}
					/>
				</div>
			) : null}
			{data && lines.length > 0 ? (
				<div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
					<StatStrip
						items={[
							{
								label: e.duration,
								value: formatMinutes(lines.reduce((a, l) => a + l.minutes, 0)),
								icon: <ClockIcon size={12} />,
								tone: "accent",
							},
							...STATE_ORDER.map((s) => ({
								label: e.state[s],
								value: String(lines.filter((l) => l.state === s).length),
								tone: (s === "to-send" ? "warning" : s === "in-tracker" ? "success" : "info") as
									| "warning"
									| "success"
									| "info",
							})),
						]}
					/>
					<div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[22rem_1fr]">
						<Heatmap month={shownMonth} lines={lines} title={t.work.heatmap} />
						<Panel
							title={t.tabs.work.time}
							count={lines.length}
							flush
							className="min-h-0"
							bodyClassName="min-h-0 flex-1"
						>
							<DataTable
								label={t.tabs.work.time}
								data={lines}
								columns={columns}
								rowId={(r) => r.id}
								group={(r) => r.state}
								groupLabel={(g) => e.state[g as TimeState]}
							/>
						</Panel>
					</div>
				</div>
			) : null}
		</ListDetail>
	);
}
