import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useRef, useState } from "react";
import { NoProject } from "@/features/shell/no-project";
import { useGuard } from "@/features/work/guard";
import { TicketField } from "@/features/work/ticket-field";
import { weekStart } from "@/features/work/week-focus";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog, type TimeState } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { RightButton, RightIconButton } from "@/lib/rights";
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
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { Switch } from "@/ui/atoms/switch";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	ClockIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { DataTable } from "@/ui/organisms/data-table";
import { firstName, usePlainDay } from "./capacity";
import { TimeTeam } from "./time-team";
import { type WeekEntry, WeekGrid } from "./week-grid";

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
	/** The whole note: the line above shows its first line only. */
	fullNote: string;
	/** The local duration, or the tracker's for a row that only the tracker has. */
	minutes: number;
	/** The tracker duration, when it differs from the local one. */
	tracker: number | null;
	lost: boolean;
	entryId: string | null;
	/** Why the issue tracker does not hold the entry as written here. */
	unsynced: string | null;
};

const firstLine = (s: string) => s.split("\n")[0] ?? "";

/** One row of the month as a line. `ticket` names the ticket of a row that only the tracker has. */
function toLine(r: TimeRow, ticket: string): Line {
	return {
		id: r.entry?.id ?? `log:${r.log?.id}`,
		state: r.state,
		day: r.entry?.day ?? "",
		ticket: r.entry?.ticket ?? ticket,
		note: firstLine(r.entry?.note ?? r.log?.note ?? ""),
		fullNote: r.entry?.note ?? "",
		minutes: r.entry?.minutes ?? r.log?.minutes ?? 0,
		tracker: r.differs && r.log ? r.log.minutes : null,
		lost: r.lostReceipt,
		entryId: r.entry?.id ?? null,
		unsynced: r.entry?.unsynced ?? null,
	};
}

/** Plan / Time: the entries of one member and month. A send is one click on one entry (REQ-020 to REQ-024). */
export function PlanTime() {
	const { t, lang } = useI18n();
	const plain = usePlainDay();
	const navigate = useNavigate();
	const search: { page?: unknown; member?: unknown } = useSearch({ strict: false });
	const e = t.work.time;
	const active = useActiveProject().data;
	const ctx = useWorkContext().data;
	const team = useTeam().data;
	const members = team?.team.members ?? [];
	/** The team file has no member: Time has nobody to book for, so it offers to add the person. */
	const noTeam = team !== undefined && members.length === 0;
	const items = useWorkItems({}).data ?? [];
	const act = useWorkActions();
	const { error, failure, busy, run, setError } = useGuard();
	// The address holds the person: the page of the team links to the week of one person.
	const member = typeof search.member === "string" ? search.member : null;
	const setMember = (m: string) =>
		void navigate({ search: (prev: object) => ({ ...prev, member: m }), replace: true } as never);
	const [month, setMonth] = useState<string | null>(null);
	/** The Monday of the week of the grid. Null is the week of today, or the first week of another month. */
	const [week, setWeek] = useState<string | null>(null);
	/** The cell whose change did not go through: its field shows the stored hours again. */
	const [undone, setUndone] = useState({ cell: "", n: 0 });
	const [adding, setAdding] = useState(false);
	/** What the last Fill from my work did, as a sentence. */
	const [filled, setFilled] = useState<string | null>(null);
	const [reduce, setReduce] = useState(false);
	/** The entry that goes to the tracker now. One send at a time: a second click waits for it. */
	const [sending, setSending] = useState<string | null>(null);
	const sendingNow = useRef(false);
	/** The entry in edit. Its fields live in `draft`: a keystroke must not rebuild the columns (the input would lose focus). */
	const [editId, setEditId] = useState<string | null>(null);
	const draft = useRef({ duration: "", note: "" });
	const [fetched, setFetched] = useState<Record<string, TimeRow[]>>({});
	const [form, setForm] = useState({ day: "", duration: "", ticket: "", note: "" });
	const shownMonth = month ?? ctx?.today.slice(0, 7) ?? "";
	const view = useTimeView(member, shownMonth);
	const data = view.data;
	const handle = data?.member ?? member;
	const first = `${shownMonth}-01`;
	// No month before the project context is here.
	const shownWeek = !shownMonth
		? ""
		: (week ??
			(ctx?.today.startsWith(shownMonth)
				? weekStart(ctx.today)
				: weekStart(addDays(first, (8 - isoWeekday(first)) % 7))));
	// A week at the edge of the month has days of one other month: the grid reads that month too.
	const edge =
		(shownWeek ? [shownWeek, addDays(shownWeek, 6)] : [])
			.map((d) => d.slice(0, 7))
			.find((m) => m !== shownMonth) ?? shownMonth;
	const beside = useTimeView(member, edge).data;

	const lines = useMemo<Line[]>(() => {
		if (!data) return [];
		const tickets = new Set(Object.keys(fetched));
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
				cell: ({ row }) => {
					const r = row.original;
					// The reason is the title of the dot: synced, or not synced and why.
					return r.unsynced ? (
						<StatusDot status="warning" label={format(e.unsynced, { reason: r.unsynced })} />
					) : (
						<StatusDot status={DOT[r.state]} label={e.state[r.state]} />
					);
				},
			},
			{
				id: "day",
				header: e.day,
				meta: { width: "6.5rem" },
				cell: ({ row }) => <span>{row.original.day && plain(row.original.day)}</span>,
			},
			{
				id: "ticket",
				header: e.ticket,
				meta: { width: "6rem" },
				cell: ({ row }) => <span className="font-mono text-11">{row.original.ticket}</span>,
			},
			{
				id: "note",
				header: e.note,
				cell: ({ row }) =>
					editId === row.original.entryId ? (
						<Input
							label={e.note}
							defaultValue={draft.current.note}
							onChange={(ev) => {
								draft.current.note = ev.target.value;
							}}
						/>
					) : (
						row.original.note
					),
			},
			{
				id: "duration",
				header: e.duration,
				meta: { width: "9rem", numeric: true },
				cell: ({ row }) =>
					editId === row.original.entryId ? (
						<Input
							label={e.duration}
							defaultValue={draft.current.duration}
							onChange={(ev) => {
								draft.current.duration = ev.target.value;
							}}
							className="w-24 font-mono"
						/>
					) : (
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
				meta: { width: "12rem" },
				cell: ({ row }) => {
					const r = row.original;
					if (!r.entryId) return null;
					const id = r.entryId;
					const label = { day: r.day, ticket: r.ticket };
					if (editId === id)
						return (
							<span className="flex items-center gap-1">
								<RightButton
									className="min-h-control"
									right="work.edit"
									variant="primary"
									onClick={() => {
										const minutes = parseDuration(draft.current.duration);
										if (minutes === null) return setError(e.badDuration);
										void run(async () => {
											const saved = await act.updateTime(
												handle,
												r.day,
												id,
												minutes,
												draft.current.note,
											);
											setFetched({});
											setEditId(null);
											if (saved.error) setError(format(e.unsynced, { reason: saved.error }));
										});
									}}
								>
									{t.work.save}
								</RightButton>
								<Button className="min-h-control" variant="ghost" onClick={() => setEditId(null)}>
									{t.sync.backlog.cancel}
								</Button>
							</span>
						);
					return (
						<span className="flex items-center justify-end gap-1">
							{r.state !== "to-send" && !r.lost && !r.unsynced ? null : (
								<RightButton
									className="min-h-control"
									right="work.edit"
									variant="ghost"
									disabled={!data?.canSend || !r.ticket || sending !== null}
									reason={
										!data?.canSend
											? format(t.work.missing, { name: t.connections.flag.timeTracking })
											: !r.ticket
												? e.noTicket
												: undefined
									}
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
								</RightButton>
							)}
							<RightIconButton
								className="size-(--control-h)"
								right="work.edit"
								label={format(e.editEntry, label)}
								onClick={() => {
									draft.current = { duration: formatMinutes(r.minutes), note: r.fullNote };
									setEditId(id);
								}}
							>
								<PencilIcon size={14} />
							</RightIconButton>
							<RightIconButton
								className="size-(--control-h)"
								right="work.edit"
								label={format(e.deleteEntry, label)}
								onClick={() =>
									void run(async () => {
										if (!(await confirmDialog(format(e.confirmDelete, label)))) return;
										await act.removeTime(handle, r.day, id);
										setFetched({});
									})
								}
							>
								<TrashIcon size={14} />
							</RightIconButton>
						</span>
					);
				},
			},
		],
		[e, t, data?.canSend, handle, reduce, act, run, sending, plain, editId, setError],
	);

	if (active === undefined)
		return <Loading icon={<ClockIcon size={16} />} title={t.tabs.work.time} />;
	if (active === null) return <NoProject title={t.tabs.work.time} icon={<ClockIcon size={16} />} />;
	if (!ctx) return <Loading icon={<ClockIcon size={16} />} title={t.tabs.work.time} />;

	const weekEntries: WeekEntry[] = [
		...lines,
		...(edge === shownMonth ? [] : (beside?.rows ?? []).map((r) => toLine(r, ""))),
	].flatMap((l) =>
		l.entryId
			? [
					{
						id: l.entryId,
						day: l.day,
						ticket: l.ticket,
						minutes: l.minutes,
						note: l.fullNote,
						pending: l.state === "to-send" || Boolean(l.unsynced),
					},
				]
			: [],
	);
	/** A cell of the week: a new value adds or changes the entry, an empty value or 0 deletes it. */
	const setCell = (ticket: string, day: string, entry: WeekEntry | null, text: string) => {
		const minutes = text === "" ? 0 : parseDuration(text);
		const undo = () => setUndone((u) => ({ cell: `${ticket}|${day}`, n: u.n + 1 }));
		if (minutes === null) {
			undo();
			return setError(e.badDuration);
		}
		void run(async () => {
			let unsynced: string | null = null;
			if (!entry) {
				if (minutes === 0) return;
				unsynced = (await act.addTime(handle, day, minutes, "", ticket || null, reduce)).error;
			} else if (minutes === 0) {
				if (!(await confirmDialog(format(e.confirmDelete, { day, ticket })))) return undo();
				await act.removeTime(handle, day, entry.id);
			} else {
				unsynced = (await act.updateTime(handle, day, entry.id, minutes, entry.note)).error;
			}
			setFetched({});
			if (unsynced) setError(format(e.unsynced, { reason: unsynced }));
		}).then((ok) => ok || undo());
	};
	const toWeek = (next: string) => {
		setWeek(next);
		const months = [next, addDays(next, 6)].map((d) => d.slice(0, 7));
		if (!months.includes(shownMonth)) setMonth(months[0] ?? shownMonth);
	};
	const toMonth = (by: number) => {
		setMonth(addMonths(shownMonth, by));
		setWeek(null);
	};

	const submit = async (ev: React.FormEvent) => {
		ev.preventDefault();
		const minutes = parseDuration(form.duration);
		if (minutes === null) return setError(e.badDuration);
		const day = form.day || ctx.today;
		let unsynced: string | null = null;
		const ok = await run(async () => {
			const saved = await act.addTime(
				handle,
				day,
				minutes,
				form.note,
				form.ticket.trim() || null,
				reduce,
			);
			unsynced = saved.error;
			setFetched({});
		});
		if (ok) {
			if (unsynced) setError(format(e.unsynced, { reason: unsynced }));
			setForm({ day: "", duration: "", ticket: "", note: "" });
			setAdding(false);
			setMonth(day.slice(0, 7));
			setWeek(weekStart(day));
		}
	};
	// One read of the whole month: the worklogs of each ticket of the month.
	const fetchAll = () =>
		run(async () => {
			const pulled = await act.pullMonth(handle, shownMonth);
			setFetched(Object.fromEntries(pulled.map((p) => [p.ticket, p.rows])));
		});

	const p = t.planPlace;
	const nameOf = (ticket: string) => items.find((i) => i.key === ticket)?.title ?? ticket;
	/** The first line of the note, for each entry of a row that shows the old one. The rest stays. */
	const setNote = (row: WeekEntry[], text: string) =>
		void run(async () => {
			const shown = (row[0]?.note ?? "").split("\n")[0];
			let unsynced: string | null = null;
			for (const x of row) {
				const [first, ...rest] = x.note.split("\n");
				if (first !== shown) continue;
				const saved = await act.updateTime(
					handle,
					x.day,
					x.id,
					x.minutes,
					[text, ...rest].join("\n"),
				);
				unsynced = saved.error ?? unsynced;
			}
			setFetched({});
			if (unsynced) setError(format(e.unsynced, { reason: unsynced }));
		});
	// The receipt of each entry whose answer was lost: the issue tracker holds the worklog already.
	const lost = lines.filter((l) => l.lost && l.entryId);
	const keepReceipts = () =>
		void run(async () => {
			for (const l of lost) await act.sendTime(handle, l.day, l.entryId ?? "", reduce);
			setFetched({});
		});
	const total = new Map<string, number>();
	for (const l of lines) if (l.day) total.set(l.day, (total.get(l.day) ?? 0) + l.minutes);
	const monthDays: string[] = [];
	for (let d = first; d.startsWith(shownMonth); d = addDays(d, 1)) monthDays.push(d);
	const name = members.find((m) => m.handle === handle)?.name;
	const entriesPage = search.page === "entries";

	const memberSelect = (
		<Select
			label={e.member}
			value={handle ?? ""}
			onValueChange={setMember}
			items={members.map((m) => ({ value: m.handle, label: m.name }))}
		/>
	);
	// Fill from my work (`spec:shell-setup-rights#REQ-005`): the entries of today show in the week of today.
	const fill = (
		<RightButton
			right="work.edit"
			disabled={!data}
			busy={busy}
			onClick={() =>
				void run(async () => {
					const out = await act.fillTime(handle, ctx.today);
					setFetched({});
					setMonth(null);
					setWeek(null);
					setFilled(
						out.entries.length
							? format(t.shellFn.time.filled, { count: out.entries.length })
							: t.shellFn.time.nothing,
					);
				})
			}
		>
			{t.shellFn.time.fill}
		</RightButton>
	);
	const readMonth = (
		<RightButton right="work.edit" disabled={!data} busy={busy} onClick={() => void fetchAll()}>
			{p.time.readMonth}
		</RightButton>
	);
	const lower = <Switch label={p.time.lower} checked={reduce} onCheckedChange={setReduce} />;
	const stepper = (label: string, before: string, after: string, step: (by: number) => void) => (
		<>
			<IconButton variant="outline" label={before} onClick={() => step(-1)}>
				<ChevronLeftIcon size={20} />
			</IconButton>
			<h2 className="text-20 font-semibold text-n-12">{label}</h2>
			<IconButton variant="outline" label={after} onClick={() => step(1)}>
				<ChevronRightIcon size={20} />
			</IconButton>
		</>
	);
	// The issue tracker takes no hours: the send row and the send page say so.
	const missing =
		data && !data.canSend
			? format(t.work.missing, { name: t.connections.flag.timeTracking })
			: null;
	const notices = (
		<>
			{error && !failure ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<ErrorNotice error={failure ?? (noTeam ? null : view.error)} />
			{noTeam ? (
				<EmptyState
					title={t.empty.team}
					action={{
						label: e.addMe,
						icon: <PlusIcon size={14} />,
						onClick: () => void run(() => act.addMe()),
					}}
				/>
			) : null}
			{adding ? (
				<Card pad className="shrink-0">
					<form
						onSubmit={(ev) => void submit(ev)}
						onKeyDown={(ev) => ev.key === "Escape" && setAdding(false)}
						className="flex flex-wrap items-end gap-2"
					>
						<Input
							caption
							label={e.day}
							type="date"
							value={form.day || ctx.today}
							onChange={(ev) => setForm({ ...form, day: ev.target.value })}
							className="w-44"
							autoFocus
						/>
						<Input
							caption
							label={e.duration}
							value={form.duration}
							onChange={(ev) => setForm({ ...form, duration: ev.target.value })}
							className="w-24"
						/>
						<span className="min-w-64 flex-[2]">
							<TicketField
								label={e.ticket}
								value={form.ticket}
								onChange={(ticket) => setForm({ ...form, ticket })}
								items={items}
							/>
						</span>
						<span className="min-w-40 flex-1">
							<Input
								caption
								label={e.note}
								value={form.note}
								onChange={(ev) => setForm({ ...form, note: ev.target.value })}
							/>
						</span>
						<RightButton right="work.edit" type="submit" variant="primary">
							{p.time.addTicket}
						</RightButton>
						<Button variant="ghost" onClick={() => setAdding(false)}>
							{t.sync.backlog.cancel}
						</Button>
					</form>
				</Card>
			) : null}
		</>
	);

	if (search.page === "team") return <TimeTeam month={shownMonth} />;
	if (entriesPage)
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<PageHeader
					title={p.time.sendHours}
					back={
						<BackLink
							label={p.views.time}
							render={(props) => (
								<Link
									to="/plan/time"
									search={(prev: object) => ({ ...prev, page: undefined }) as never}
									{...props}
								/>
							)}
						/>
					}
				/>
				<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-1 pb-4">
					<div className="flex shrink-0 flex-wrap items-center gap-4">
						{stepper(monthLabel(shownMonth, lang), e.previous, e.next, toMonth)}
						<span className="flex-1" />
						{memberSelect}
						{readMonth}
						{lower}
					</div>
					{missing ? <p className="text-n-10">{missing}</p> : null}
					{notices}
					{data ? (
						<div className="flex shrink-0 flex-wrap gap-3.5">
							{[
								{
									label: e.duration,
									value: formatMinutes(lines.reduce((a, l) => a + l.minutes, 0)),
								},
								...STATE_ORDER.map((s) => ({
									label: e.state[s],
									value: String(lines.filter((l) => l.state === s).length),
								})),
							].map((x) => (
								<Card key={x.label} className="flex flex-[1_1_11rem] flex-col gap-1 p-5">
									<span className="text-13 font-semibold text-n-10">{x.label}</span>
									<span className="text-30 font-semibold text-n-12">{x.value}</span>
								</Card>
							))}
						</div>
					) : null}
					{data && lines.length === 0 ? (
						<EmptyState
							title={t.empty.time}
							action={{
								label: p.time.addTicket,
								icon: <PlusIcon size={14} />,
								onClick: () => setAdding(true),
							}}
						/>
					) : null}
					{data && lines.length > 0 ? (
						<Card className="flex min-h-64 flex-1 flex-col overflow-hidden">
							<DataTable
								label={t.tabs.work.time}
								data={lines}
								columns={columns}
								rowId={(r) => r.id}
								rowHeight={52}
								group={(r) => r.state}
								groupLabel={(g) => e.state[g as TimeState]}
							/>
						</Card>
					) : null}
				</div>
			</div>
		);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={<ClockIcon size={16} />}
				title={
					!handle || handle === ctx.me
						? p.time.myTime
						: format(p.time.timeOf, { name: firstName(name ?? handle) })
				}
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
				<div className="flex shrink-0 flex-wrap items-center gap-4">
					{stepper(format(p.week, { day: plain(shownWeek) }), p.previousWeek, p.nextWeek, (by) =>
						toWeek(addDays(shownWeek, by * 7)),
					)}
					<span className="flex-1" />
					{memberSelect}
					{fill}
					{readMonth}
				</div>
				{filled ? (
					<p role="status" className="text-ui text-n-11">
						{filled}
					</p>
				) : null}
				{data ? (
					<Card pad className="flex shrink-0 flex-wrap items-center gap-4">
						<span className="font-semibold">{monthLabel(shownMonth, lang)}</span>
						<div
							role="img"
							aria-label={t.work.heatmap}
							// One row for the longest month: the squares get smaller, they do not wrap.
							className="flex flex-[1_1_20rem] gap-1"
						>
							{monthDays.map((d) => {
								const m = total.get(d) ?? 0;
								return (
									<i
										key={d}
										title={format(p.time.dayHours, { day: plain(d), hours: formatMinutes(m) })}
										className={`aspect-square max-w-5 min-w-0 flex-1 rounded-[calc(var(--radius-sm)/2)] ${m >= 360 ? "bg-accent" : m > 0 ? "bg-accent/45" : "bg-n-5"}`}
									/>
								);
							})}
						</div>
						<RightButton
							right="work.edit"
							disabled={lost.length === 0 || busy}
							onClick={keepReceipts}
						>
							{p.time.receipt}
						</RightButton>
						{lower}
					</Card>
				) : null}
				{notices}
				{data ? (
					<WeekGrid
						week={shownWeek}
						entries={weekEntries}
						undone={undone}
						nameOf={nameOf}
						onChange={setCell}
						onNote={setNote}
						onAdd={() => setAdding(true)}
					/>
				) : null}
				<Card className="shrink-0 py-2">
					<Row
						render={(props) => (
							<Link
								to="/plan/time"
								search={(prev: object) => ({ ...prev, page: "team" }) as never}
								{...props}
							/>
						)}
					>
						<span className="flex-1 font-semibold">{p.time.team}</span>
						<ChevronRightIcon size={20} />
					</Row>
					<Row
						render={(props) => (
							<Link
								to="/plan/time"
								search={(prev: object) => ({ ...prev, page: "entries" }) as never}
								{...props}
							/>
						)}
					>
						<span className="flex-1 font-semibold">{p.time.sendHours}</span>
						<Badge>{missing ?? p.time.asksFirst}</Badge>
					</Row>
				</Card>
			</div>
		</div>
	);
}
