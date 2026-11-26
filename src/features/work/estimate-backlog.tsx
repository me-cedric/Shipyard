import { type PointerEvent, useMemo, useRef } from "react";
import { EstimateAgent } from "@/features/plan/estimate-agent";
import { useDays } from "@/features/plan/estimate-cards";
import { Stepper } from "@/features/plan/estimate-stepper";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { useViewState } from "@/lib/shell/view-state";
import { cn } from "@/lib/utils";
import {
	type Confidence,
	type Feature,
	figure,
	type Sheet,
	type SheetView,
	type Task,
	useSealState,
	useWorkActions,
} from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { LinkButton } from "@/ui/atoms/link-button";
import { Select } from "@/ui/atoms/select";
import { QueueListIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { FilterBar } from "@/ui/molecules/filter-bar";
import { CONTROLS } from "./estimate-forms";
import { useGuard } from "./guard";
import { roleId } from "./team-rights";

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
		const row = e.currentTarget.closest("li")?.getBoundingClientRect().height;
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
			className="cursor-grab touch-none"
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

/** A new likely value of a task, never below 0 and, on a three-point task, between best and worst. */
const clampLikely = (x: Task, days: number) =>
	Math.min(x.pessimistic ?? Infinity, Math.max(x.optimistic ?? 0, days, 0));

/** The tasks of a sheet, by id. */
const tasksOf = (sheet: Sheet) => sheet.features.flatMap((f) => f.tasks);

/**
 * The tasks of a sheet (Plan / Estimates, Tasks): each feature is a heading with its days, and each
 * task is a row with a bar for its size and a stepper that saves at once. `tools` shows the search,
 * the filters, the selection and the handle that moves a task in its feature. A sealed or frozen
 * sheet shows the rows and takes no change.
 */
export function EstimateBacklog({
	slug,
	view,
	tools,
	onTools,
	picked,
	onPicked,
	onOpen,
	className,
}: {
	slug: string;
	view: SheetView;
	tools: boolean;
	/** Turns the tools on: Ask an agent opens the selection with it. */
	onTools: () => void;
	picked: Set<string>;
	onPicked: (picked: Set<string>) => void;
	/** Opens the page of a task. */
	onOpen: (taskId: string) => void;
	className?: string;
}) {
	const { t, lang } = useI18n();
	const c = t.costing;
	const daysText = useDays();
	const act = useWorkActions();
	const { failure, run, busy } = useGuard();
	const sheet = view.sheet;
	const frozen = sheet.frozen === true;
	const sealed = useSealState().data?.sealed === true;
	const { can, gate } = useRights();
	const [query, setQuery] = useViewState("filters:estimate-query", "");
	const [active, setActive] = useViewState<string[]>("filters:estimate-active", []);

	const roles = [...new Set(tasksOf(sheet).map((x) => x.role))].sort();
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
	const dayOf = (id: string) => view.days[id] ?? 0;
	const max = Math.max(1, ...tasksOf(sheet).map((x) => dayOf(x.id)));
	const off = sealed ? c.agent.sealed : frozen ? c.sheet.frozen : gate("work.edit").reason;
	const locked = off !== undefined || !can("work.edit");

	const save = (next: Sheet) => run(() => act.saveSheet(slug, next));
	// A task in days moves by one day. A percent task moves by five points.
	const step = (id: string, by: number) =>
		save({
			...sheet,
			features: sheet.features.map((f) => ({
				...f,
				tasks: f.tasks.map((x) =>
					x.id !== id
						? x
						: x.percent != null
							? { ...x, percent: Math.max(0, x.percent + 5 * by) }
							: { ...x, days: clampLikely(x, (x.days ?? 0) + by) },
				),
			})),
		});
	// A filter that is on stays in view: a hidden filter would hide tasks with no reason on screen.
	const filtering = tools || query !== "" || active.length > 0;
	const picking = tools || picked.size > 0;

	return (
		<Card pad className={cn("flex flex-col", CONTROLS, className)}>
			{filtering ? (
				<div className="pb-3">
					<FilterBar
						query={query}
						onQueryChange={setQuery}
						filters={[
							...roles.map((r) => ({
								id: r,
								label:
									(t.rights.role as Record<string, string>)[roleId(r)] ??
									`${r.charAt(0).toUpperCase()}${r.slice(1)}`,
							})),
							{ id: LOW, label: c.filter.lowConfidence },
							{ id: NO_TICKET, label: c.filter.noTicket },
						]}
						active={active}
						onToggle={(id) =>
							setActive(active.includes(id) ? active.filter((x) => x !== id) : [...active, id])
						}
					/>
				</div>
			) : null}
			<div className="flex flex-wrap items-center gap-2 pb-3">
				<EstimateAgent slug={slug} view={view} ids={[...picked]} onPick={onTools} />
			</div>
			<ErrorNotice error={failure} />
			{lines.length === 0 ? <EmptyState title={t.empty.tasks} /> : null}
			<div className="overflow-x-auto">
				<div className="min-w-[520px]">
					{sheet.features
						.filter((f) => f.tasks.some((x) => visible.has(x.id)))
						.map((f, at) => (
							<section
								key={f.id}
								aria-label={f.name}
								className={at > 0 ? "mt-3.5 border-t border-n-6 pt-4" : undefined}
							>
								<div className="flex items-baseline gap-2.5 pt-1 pb-1.5">
									<h2 className="text-17 font-semibold">{f.name}</h2>
									<span className="text-n-11">
										{daysText(f.tasks.reduce((n, x) => n + dayOf(x.id), 0))}
									</span>
								</div>
								<ul>
									{f.tasks
										.filter((x) => visible.has(x.id))
										.map((task) => (
											// The handle reads the height of its item for a drag.
											<li key={task.id} className="flex min-h-14 items-center gap-4">
												{picking ? (
													<span className="flex shrink-0 items-center gap-0.5">
														<Checkbox
															label={format(c.bulk.select, { name: task.name })}
															hideLabel
															checked={picked.has(task.id)}
															onCheckedChange={(on) => {
																const next = new Set(picked);
																if (on) next.add(task.id);
																else next.delete(task.id);
																onPicked(next);
															}}
														/>
														<MoveHandle
															label={format(c.task.move, { name: task.name })}
															disabled={locked}
															onMove={(by) => void save(moveTask(sheet, task.id, by, visible))}
														/>
													</span>
												) : null}
												<LinkButton
													className="w-48 shrink-0 self-center text-left"
													onClick={() => onOpen(task.id)}
												>
													<span className="truncate">{task.name}</span>
												</LinkButton>
												<span
													role="img"
													aria-label={daysText(dayOf(task.id))}
													className="min-w-0 flex-1"
												>
													<span
														className="block h-7 rounded-sm bg-accent-subtle"
														style={{ width: `${(dayOf(task.id) / max) * 100}%` }}
													/>
												</span>
												<Stepper
													label={task.name}
													value={
														task.percent != null
															? `${figure(task.percent, lang)} %`
															: figure(
																	task.optimistic != null && task.pessimistic != null
																		? (task.days ?? 0)
																		: dayOf(task.id),
																	lang,
																)
													}
													disabled={locked || busy}
													reason={off}
													onStep={(by) => void step(task.id, by)}
												/>
											</li>
										))}
								</ul>
							</section>
						))}
				</div>
			</div>
		</Card>
	);
}

/**
 * The card "Many tasks at once": the bulk edit of the selected tasks. It shows on the task list
 * and on the page of one task. A frozen sheet shows no card.
 */
export function EstimateBulk({
	slug,
	view,
	picked,
	onPicked,
}: {
	slug: string;
	view: SheetView;
	picked: Set<string>;
	onPicked: (picked: Set<string>) => void;
}) {
	const { t } = useI18n();
	const c = t.costing;
	const act = useWorkActions();
	const { failure, run } = useGuard();
	const sheet = view.sheet;
	const [role, setRole] = useViewState("filters:estimate-role", "");
	const count = tasksOf(sheet).filter((x) => picked.has(x.id)).length;
	if (count === 0 || sheet.frozen === true) return null;

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
		const moving = tasksOf(sheet).filter((x) => picked.has(x.id));
		return save({
			...sheet,
			features: sheet.features.map((f) => {
				const kept = f.tasks.filter((x) => !picked.has(x.id));
				return f.id === id ? { ...f, tasks: [...kept, ...moving] } : { ...f, tasks: kept };
			}),
		});
	};
	const removeAll = async () => {
		if (!(await confirmDialog(format(c.bulk.confirmDelete, { count })))) return;
		if (
			await save({
				...sheet,
				features: sheet.features.map((f) => ({
					...f,
					tasks: f.tasks.filter((x) => !picked.has(x.id)),
				})),
			})
		)
			onPicked(new Set());
	};
	const title = format(c.estimate.manySelected, { count });

	return (
		<Card pad>
			<section aria-label={title} className={`flex flex-col gap-3 ${CONTROLS}`}>
				<h2 className="text-13 font-semibold text-n-11">{c.estimate.many}</h2>
				<span className="text-20 font-semibold">{title}</span>
				<form
					className="flex flex-wrap gap-2.5"
					onSubmit={(ev) => {
						ev.preventDefault();
						if (role.trim()) void edit((x) => ({ ...x, role: role.trim() }));
					}}
				>
					<Input
						label={c.bulk.role}
						value={role}
						onChange={(ev) => setRole(ev.target.value)}
						className="flex-[1_1_120px]"
					/>
					<RightButton right="work.edit" type="submit" disabled={role.trim() === ""}>
						{c.bulk.apply}
					</RightButton>
				</form>
				<div className="flex flex-wrap gap-2.5">
					<Select
						className="flex-[1_1_120px]"
						label={c.bulk.feature}
						value={PICK}
						placeholder={c.bulk.feature}
						onValueChange={(v) => v !== PICK && void toFeature(v)}
						items={sheet.features.map((f) => ({ value: f.id, label: f.name }))}
					/>
					<Select
						className="flex-[1_1_120px]"
						label={c.bulk.confidence}
						value={PICK}
						placeholder={c.bulk.confidence}
						onValueChange={(v) =>
							v !== PICK &&
							void edit(({ confidence: _drop, ...x }) =>
								v === UNSET ? x : { ...x, confidence: v as Confidence },
							)
						}
						items={[
							...(["low", "medium", "high"] as const).map((v) => ({
								value: v,
								label: c.task.level[v],
							})),
							{ value: UNSET, label: c.task.unset },
						]}
					/>
				</div>
				<div className="flex flex-wrap gap-2.5">
					<RightButton
						right="work.edit"
						className="text-danger-text"
						onClick={() => void run(removeAll)}
					>
						{c.bulk.delete}
					</RightButton>
					<Button onClick={() => onPicked(new Set())}>{c.bulk.clear}</Button>
				</div>
				<ErrorNotice error={failure} />
			</section>
		</Card>
	);
}
