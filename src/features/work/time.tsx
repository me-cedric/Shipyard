import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import type { TimeState } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { useWorkItems } from "@/lib/sync";
import {
	addMonths,
	formatMinutes,
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
import { ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
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
							disabled={!data?.canSend || !r.ticket}
							aria-label={format(r.lost ? e.storeReceipt : e.sendEntry, {
								day: r.day,
								ticket: r.ticket,
							})}
							onClick={() =>
								void run(async () => {
									await act.sendTime(handle, r.day, r.entryId ?? "", reduce);
									setFetched({});
								})
							}
						>
							{r.lost ? e.storeReceipt : e.send}
						</Button>
					);
				},
			},
		],
		[e, data?.canSend, handle, reduce, act, run],
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
					{adding ? null : (
						<Button variant="primary" disabled={!data} onClick={() => setAdding(true)}>
							<PlusIcon size={14} />
							{e.add}
						</Button>
					)}
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
				<DataTable
					label={t.tabs.work.time}
					data={lines}
					columns={columns}
					rowId={(r) => r.id}
					group={(r) => r.state}
					groupLabel={(g) => e.state[g as TimeState]}
				/>
			) : null}
		</ListDetail>
	);
}
