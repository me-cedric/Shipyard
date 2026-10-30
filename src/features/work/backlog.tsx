import { useMemo, useState } from "react";
import { useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { useActiveProject } from "@/lib/projects";
import { useFormIntent, useShell } from "@/lib/shell";
import { useBacklogActions, useWorkItems, type WorkItem } from "@/lib/sync";
import { figure, memberName, useSheet, useSheets, useTeam } from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { PlusIcon, QueueListIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { RUN_STATUS } from "@/ui/molecules/run-card";
import {
	CategoryDot,
	type PriorityLevel,
	priorityOf,
	TicketRow,
	type WorkCategory,
} from "@/ui/molecules/ticket-row";
import { VirtualList } from "@/ui/organisms/virtual-list";
import { ListDetail } from "@/ui/templates/list-detail";
import { applyFilters, type Filters, ItemFilters, NO_FILTER } from "./filters";
import { useGuard } from "./guard";
import { NoProject } from "./no-project";
import { TicketDetail } from "./ticket-detail";

const CATEGORY_ORDER: WorkCategory[] = ["todo", "in-progress", "done"];

type Entry =
	| { kind: "head"; status: string; category: WorkCategory; count: number }
	| { kind: "row"; item: WorkItem };

/**
 * The days of each ticket in the first ready estimate sheet, keyed by the ticket key.
 * shortcut: one sheet only; read every sheet when a project links tickets from several lots.
 */
export function useEstimateDays(): Map<string, number> {
	const slug = (useSheets().data ?? []).find((s) => s.state === "ready")?.slug ?? null;
	const sheet = useSheet(slug).data;
	return useMemo(() => {
		const out = new Map<string, number>();
		for (const f of sheet?.sheet.features ?? [])
			for (const task of f.tasks) {
				const days = sheet?.days[task.id];
				if (task.ticket && days != null) out.set(task.ticket.replace(/^wi:/, ""), days);
			}
		return out;
	}, [sheet]);
}

/** The last run of each ticket, keyed by the ticket key. */
export function useRunOf() {
	const runs = useRuns().data;
	return useMemo(() => new Map((runs ?? []).map((r) => [r.key, r])), [runs]);
}

/** The statuses in board order: by category, then by name. */
export function statusesOf(items: WorkItem[]): { status: string; category: WorkCategory }[] {
	const seen = new Map<string, WorkCategory>();
	for (const i of items) seen.set(i.status, i.category as WorkCategory);
	return [...seen.entries()]
		.map(([status, category]) => ({ status, category }))
		.sort(
			(a, b) =>
				CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
				a.status.localeCompare(b.status),
		);
}

/** Work / Backlog: the mirror of the tracker in groups by status, with import, adopt and filters. */
export function Backlog() {
	const { t, lang } = useI18n();
	const menu = useMenus();
	const active = useActiveProject().data;
	const { openDetail } = useShell();
	const { planImport, confirmImport, adopt } = useBacklogActions();
	const members = useTeam().data?.team.members ?? [];
	const [filters, setFilters] = useState<Filters>(NO_FILTER);
	const [planned, setPlanned] = useState<number | null>(null);
	const [adopting, setAdopting] = useState(false);
	const [key, setKey] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const { error, run } = useGuard();
	const everything = useWorkItems({});
	const all = everything.data ?? [];
	const shown = useMemo(() => applyFilters(all, filters), [all, filters]);
	const days = useEstimateDays();
	const runOf = useRunOf();
	const priorityName: Record<PriorityLevel, string> = t.work.priority;
	// Get started asks to assign: the first ticket without an assignee opens with its assignee field.
	useFormIntent(
		"assign",
		() => {
			const item = all.find((i) => !i.assignee);
			if (!item) return;
			setSelected(item.key);
			openDetail(item.key, <TicketDetail key={item.key} itemKey={item.key} />);
		},
		!everything.isLoading,
	);

	const entries = useMemo(() => {
		const out: Entry[] = [];
		for (const { status, category } of statusesOf(shown)) {
			const rows = shown.filter((i) => i.status === status);
			out.push({ kind: "head", status, category, count: rows.length });
			for (const item of rows) out.push({ kind: "row", item });
		}
		return out;
	}, [shown]);

	if (active === undefined || everything.isLoading) return null;
	if (active === null) return <NoProject title={t.tabs.work.backlog} />;

	const startImport = () => run(async () => setPlanned(await planImport()));
	if (all.length === 0 && planned === null)
		return (
			<ListDetail title={t.tabs.work.backlog} icon={<QueueListIcon size={16} />} count={0}>
				<div className="p-4">
					<EmptyState
						action={{
							label: t.sync.backlog.import,
							icon: <PlusIcon size={14} />,
							onClick: () => void startImport(),
						}}
					/>
					{error ? (
						<p role="alert" className="pt-2 text-center text-ui text-danger-text">
							{error}
						</p>
					) : null}
				</div>
			</ListDetail>
		);

	const open = (item: WorkItem) => {
		setSelected(item.key);
		openDetail(item.key, <TicketDetail key={item.key} itemKey={item.key} />);
	};

	return (
		<ListDetail
			title={t.tabs.work.backlog}
			icon={<QueueListIcon size={16} />}
			count={all.length}
			toolbar={
				<>
					<ItemFilters
						items={all}
						value={filters}
						onChange={setFilters}
						fields={["status", "assignee", "label", "run"]}
					/>
					<span className="flex-1" />
					{adopting ? (
						<form
							onSubmit={(e) => {
								e.preventDefault();
								void run(async () => {
									await adopt(key);
									setKey("");
									setAdopting(false);
								});
							}}
							onKeyDown={(e) => e.key === "Escape" && setAdopting(false)}
						>
							<Input
								label={t.sync.backlog.key}
								value={key}
								onChange={(e) => setKey(e.target.value)}
								className="w-36"
								autoFocus
							/>
						</form>
					) : (
						<IconButton label={t.sync.backlog.adopt} onClick={() => setAdopting(true)}>
							<PlusIcon size={14} />
						</IconButton>
					)}
					{planned === null ? (
						<Button variant="primary" onClick={() => void startImport()}>
							{t.sync.backlog.import}
						</Button>
					) : (
						<>
							<p role="status" className="text-ui">
								{format(t.sync.backlog.openTickets, { count: planned })}
							</p>
							<Button
								variant="primary"
								onClick={() =>
									void run(async () => {
										await confirmImport();
										setPlanned(null);
									})
								}
							>
								{t.sync.backlog.confirm}
							</Button>
							<Button variant="ghost" onClick={() => setPlanned(null)}>
								{t.sync.backlog.cancel}
							</Button>
						</>
					)}
				</>
			}
		>
			{error ? (
				<p role="alert" className="px-3 py-1 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1">
				<VirtualList
					items={entries}
					rowHeight={40}
					itemKey={(e) => (e.kind === "head" ? `h:${e.status}` : e.item.key)}
					isRow={(e) => e.kind === "row"}
					renderItem={(e) =>
						e.kind === "head" ? (
							<h2 className="flex h-10 items-center gap-2 border-b bg-n-2 px-4 text-12 font-medium text-n-11">
								<span aria-hidden="true">
									<CategoryDot category={e.category} label={e.status} />
								</span>
								{format(t.count, { name: e.status, count: e.count })}
							</h2>
						) : (
							<TicketRow
								itemKey={e.item.key}
								title={e.item.title}
								status={e.item.status}
								category={e.item.category as WorkCategory}
								assignee={
									e.item.assignee
										? memberName(members, e.item.member ?? e.item.assignee)
										: undefined
								}
								unknown={e.item.assignee && !e.item.member ? t.work.unknownMember : undefined}
								claimed={e.item.claimed ? t.sync.runState.Claimed : undefined}
								selected={selected === e.item.key}
								rich
								labels={e.item.labels}
								priority={(() => {
									const level = priorityOf(e.item.labels);
									return level === null ? undefined : { level, label: priorityName[level] };
								})()}
								run={(() => {
									const r = runOf.get(e.item.key);
									return r
										? { label: t.factory.state[r.state], status: RUN_STATUS[r.state] }
										: undefined;
								})()}
								estimate={
									days.has(e.item.key)
										? format(t.work.daysShort, { days: figure(days.get(e.item.key), lang) })
										: undefined
								}
								onOpen={() => open(e.item)}
								menu={menu("ticket", {
									open: () => open(e.item),
									"copy-ref": () => copyText(`wi:${e.item.key}`),
								})}
							/>
						)
					}
				/>
			</div>
		</ListDetail>
	);
}
