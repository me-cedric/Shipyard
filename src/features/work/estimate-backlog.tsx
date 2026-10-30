import type { ColumnDef } from "@tanstack/react-table";
import { type PointerEvent, useMemo, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import {
	type Confidence,
	type Feature,
	figure,
	type Sheet,
	type SheetView,
	type Task,
	useWorkActions,
} from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { QueueListIcon, TrashIcon, XMarkIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { FilterBar } from "@/ui/molecules/filter-bar";
import { DataTable } from "@/ui/organisms/data-table";
import { useGuard } from "./guard";

type Line = { feature: Feature; task: Task };
const LOW = "@@low";
const NO_TICKET = "@@no-ticket";
const PICK = "@@pick";
const UNSET = "@@unset";

/** The sheet with `id` moved `by` places among the visible tasks of its feature. */
export function moveTask(sheet: Sheet, id: string, by: number, visible: Set<string>): Sheet {
	return {
		...sheet,
		features: sheet.features.map((f) => {
			const shown = f.tasks.filter((t) => visible.has(t.id));
			const at = shown.findIndex((t) => t.id === id);
			if (at < 0) return f;
			const target = shown[Math.max(0, Math.min(shown.length - 1, at + by))];
			if (!target || target.id === id) return f;
			const moving = f.tasks.find((t) => t.id === id) as Task;
			const rest = f.tasks.filter((t) => t.id !== id);
			const to = rest.findIndex((t) => t.id === target.id) + (by > 0 ? 1 : 0);
			return { ...f, tasks: [...rest.slice(0, to), moving, ...rest.slice(to)] };
		}),
	};
}

/** The handle of a row: Alt+Up and Alt+Down, or a drag up or down, move the task. */
function MoveHandle({
	label,
	disabled,
	onMove,
}: {
	label: string;
	disabled: boolean;
	onMove: (by: number) => void;
}) {
	const start = useRef<{ y: number; h: number } | null>(null);
	const down = (e: PointerEvent<HTMLButtonElement>) => {
		e.currentTarget.setPointerCapture?.(e.pointerId);
		const row = e.currentTarget.closest("[role=row]")?.getBoundingClientRect().height;
		start.current = { y: e.clientY, h: row || 28 };
	};
	const up = (e: PointerEvent<HTMLButtonElement>) => {
		const s = start.current;
		start.current = null;
		const by = s ? Math.round((e.clientY - s.y) / s.h) : 0;
		if (by !== 0) onMove(by);
	};
	return (
		<IconButton
			label={label}
			shortcut="Alt+↑ ↓"
			disabled={disabled}
			className="size-6 cursor-grab touch-none"
			onPointerDown={down}
			onPointerUp={up}
			onPointerCancel={() => {
				start.current = null;
			}}
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
				e.preventDefault();
				e.stopPropagation();
				onMove(e.key === "ArrowUp" ? -1 : 1);
			}}
		>
			<QueueListIcon size={12} />
		</IconButton>
	);
}

/**
 * The backlog of a sheet: search, filters, a selection for a bulk edit, and a handle on each row
 * that moves the task in its feature. A frozen sheet shows the rows and takes no change.
 */
export function EstimateBacklog({
	slug,
	view,
	selected,
	onOpen,
}: {
	slug: string;
	view: SheetView;
	selected: string | null;
	onOpen: (taskId: string) => void;
}) {
	const { t, lang } = useI18n();
	const e = t.work.estimates;
	const c = t.costing;
	const act = useWorkActions();
	const { failure, run } = useGuard();
	const sheet = view.sheet;
	const frozen = sheet.frozen === true;
	const [query, setQuery] = useState("");
	const [active, setActive] = useState<string[]>([]);
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [role, setRole] = useState("");

	const roles = [...new Set(sheet.features.flatMap((f) => f.tasks.map((x) => x.role)))].sort();
	const lines = useMemo<Line[]>(() => {
		const q = query.trim().toLowerCase();
		const want = active.filter((a) => !a.startsWith("@@"));
		return sheet.features.flatMap((feature) =>
			feature.tasks
				.filter((task) => {
					const text = [
						feature.name,
						task.name,
						task.role,
						task.ticket,
						task.note,
						task.assumptions,
					]
						.join(" ")
						.toLowerCase();
					return (
						(q === "" || text.includes(q)) &&
						(want.length === 0 || want.includes(task.role)) &&
						(!active.includes(LOW) || task.confidence === "low") &&
						(!active.includes(NO_TICKET) || !task.ticket)
					);
				})
				.map((task) => ({ feature, task })),
		);
	}, [sheet, query, active]);
	const visible = new Set(lines.map((l) => l.task.id));
	const chosen = [...picked].filter((id) => visible.has(id));

	const save = (next: Sheet) => run(() => act.saveSheet(slug, next));
	const edit = (change: (task: Task) => Task) =>
		save({
			...sheet,
			features: sheet.features.map((f) => ({
				...f,
				tasks: f.tasks.map((x) => (picked.has(x.id) ? change(x) : x)),
			})),
		});
	const toFeature = (id: string) => {
		const moving = sheet.features.flatMap((f) => f.tasks.filter((x) => picked.has(x.id)));
		return save({
			...sheet,
			features: sheet.features.map((f) => {
				const kept = f.tasks.filter((x) => !picked.has(x.id));
				return f.id === id ? { ...f, tasks: [...kept, ...moving] } : { ...f, tasks: kept };
			}),
		});
	};
	const removeAll = async () => {
		if (!(await confirmDialog(format(c.bulk.confirmDelete, { count: chosen.length })))) return;
		if (
			await save({
				...sheet,
				features: sheet.features.map((f) => ({
					...f,
					tasks: f.tasks.filter((x) => !picked.has(x.id)),
				})),
			})
		)
			setPicked(new Set());
	};

	// The columns read the selection and the sheet, so they change on each render.
	const columns: ColumnDef<Line>[] = [
		{
			id: "pick",
			header: "",
			meta: { width: "3.25rem" },
			cell: ({ row }) => {
				const task = row.original.task;
				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: it keeps the click on the checkbox from opening the row
					// biome-ignore lint/a11y/useKeyWithClickEvents: the checkbox and the handle take the keys
					<span className="flex items-center gap-0.5" onClick={(ev) => ev.stopPropagation()}>
						<Checkbox
							label={format(c.bulk.select, { name: task.name })}
							hideLabel
							checked={picked.has(task.id)}
							onCheckedChange={(on) => {
								const next = new Set(picked);
								if (on) next.add(task.id);
								else next.delete(task.id);
								setPicked(next);
							}}
						/>
						<MoveHandle
							label={format(c.task.move, { name: task.name })}
							disabled={frozen}
							onMove={(by) => void save(moveTask(sheet, task.id, by, visible))}
						/>
					</span>
				);
			},
		},
		{
			id: "task",
			header: e.task,
			meta: { width: "minmax(12rem, 28rem)" },
			cell: ({ row }) => row.original.task.name,
		},
		{
			id: "role",
			header: e.role,
			meta: { width: "6rem" },
			cell: ({ row }) => row.original.task.role,
		},
		{
			id: "days",
			header: e.days,
			meta: { width: "6rem", numeric: true },
			cell: ({ row }) => figure(view.days[row.original.task.id], lang),
		},
		{
			id: "percent",
			header: e.percent,
			meta: { width: "5rem", numeric: true },
			cell: ({ row }) =>
				row.original.task.percent == null ? "" : `${row.original.task.percent} %`,
		},
		{
			id: "confidence",
			header: c.task.confidence,
			meta: { width: "7rem" },
			cell: ({ row }) => {
				const v = row.original.task.confidence;
				return v ? c.task.level[v] : "";
			},
		},
		{
			id: "ticket",
			header: e.ticket,
			meta: { width: "8rem" },
			cell: ({ row }) => (
				<span className="font-mono text-11">{row.original.task.ticket ?? ""}</span>
			),
		},
	];

	return (
		<div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col gap-2">
			<FilterBar
				query={query}
				onQueryChange={setQuery}
				filters={[
					...roles.map((r) => ({ id: r, label: r })),
					{ id: LOW, label: c.filter.lowConfidence },
					{ id: NO_TICKET, label: c.filter.noTicket },
				]}
				active={active}
				onToggle={(id) =>
					setActive(active.includes(id) ? active.filter((x) => x !== id) : [...active, id])
				}
			/>
			{chosen.length > 0 && !frozen ? (
				<section
					aria-label={format(c.bulk.selected, { count: chosen.length })}
					className="flex flex-wrap items-end gap-2 rounded-lg border bg-surface-2 p-2"
				>
					<span className="h-row content-center text-ui font-medium">
						{format(c.bulk.selected, { count: chosen.length })}
					</span>
					<form
						className="flex items-end gap-1"
						onSubmit={(ev) => {
							ev.preventDefault();
							if (role.trim()) void edit((x) => ({ ...x, role: role.trim() }));
						}}
					>
						<Input
							caption
							label={c.bulk.role}
							value={role}
							onChange={(ev) => setRole(ev.target.value)}
						/>
						<Button type="submit" disabled={role.trim() === ""}>
							{c.bulk.apply}
						</Button>
					</form>
					<Select
						caption
						label={c.bulk.confidence}
						value={PICK}
						onValueChange={(v) =>
							v !== PICK &&
							void edit(({ confidence: _drop, ...x }) =>
								v === UNSET ? x : { ...x, confidence: v as Confidence },
							)
						}
						items={[
							{ value: PICK, label: "—" },
							...(["low", "medium", "high"] as const).map((v) => ({
								value: v,
								label: c.task.level[v],
							})),
							{ value: UNSET, label: c.task.unset },
						]}
					/>
					<Select
						caption
						label={c.bulk.feature}
						value={PICK}
						onValueChange={(v) => v !== PICK && void toFeature(v)}
						items={[
							{ value: PICK, label: "—" },
							...sheet.features.map((f) => ({ value: f.id, label: f.name })),
						]}
					/>
					<Button onClick={() => void run(removeAll)}>
						<TrashIcon size={14} />
						{c.bulk.delete}
					</Button>
					<IconButton label={c.bulk.clear} onClick={() => setPicked(new Set())}>
						<XMarkIcon size={14} />
					</IconButton>
				</section>
			) : null}
			<ErrorNotice error={failure} />
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1">
				<DataTable
					label={e.views.backlog}
					data={lines}
					columns={columns}
					rowId={(r) => r.task.id}
					group={(r) => r.feature.name}
					onOpen={(r) => onOpen(r.task.id)}
					selected={selected}
				/>
			</div>
		</div>
	);
}
