import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { pickWorkbook, saveWorkbook, type Totals } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import {
	type Feature,
	figure,
	money,
	type Preview,
	type Task,
	usePortfolio,
	useSealState,
	useSheet,
	useSheets,
	useWorkActions,
} from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	Cog6ToothIcon,
	LockClosedIcon,
	PlusIcon,
} from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Stat } from "@/ui/molecules/stat";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { SheetForm, TaskForm } from "./estimate-forms";
import { ExcelDialog } from "./excel-dialog";
import { useGuard } from "./guard";
import { NoProject } from "./no-project";
import { SealBar } from "./seal";

type View = "backlog" | "summary" | "spread" | "portfolio";
const NEW = "@@new";

type Line = { feature: Feature; task: Task };

/** The sheet of one lot in four views: backlog, summary, spread and portfolio (REQ-011). */
export function Estimates() {
	const { t, lang } = useI18n();
	const e = t.work.estimates;
	const active = useActiveProject().data;
	const sheets = useSheets();
	const seal = useSealState().data;
	const portfolio = usePortfolio().data;
	const act = useWorkActions();
	const { openDetail } = useShell();
	const { error, run } = useGuard();
	const [chosen, setChosen] = useState<string | null>(null);
	const [view, setView] = useState<View>("backlog");
	const [selected, setSelected] = useState<string | null>(null);
	const [excel, setExcel] = useState<{ path: string; preview: Preview } | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const list = sheets.data ?? [];
	const slug = chosen && list.some((s) => s.slug === chosen) ? chosen : (list[0]?.slug ?? null);
	const current = useSheet(
		slug && list.find((s) => s.slug === slug)?.state === "ready" ? slug : null,
	);
	const sheet = current.data;
	const locked = seal ? seal.sealed && !seal.unlocked : false;

	const lines = useMemo<Line[]>(
		() =>
			(sheet?.sheet.features ?? []).flatMap((f) => f.tasks.map((task) => ({ feature: f, task }))),
		[sheet],
	);

	const columns = useMemo<ColumnDef<Line>[]>(
		() => [
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
				cell: ({ row }) => figure(sheet?.days[row.original.task.id], lang),
			},
			{
				id: "percent",
				header: e.percent,
				meta: { width: "5rem", numeric: true },
				cell: ({ row }) =>
					row.original.task.percent == null ? "" : `${row.original.task.percent} %`,
			},
			{
				id: "ticket",
				header: e.ticket,
				meta: { width: "8rem" },
				cell: ({ row }) => (
					<span className="font-mono text-11">{row.original.task.ticket ?? ""}</span>
				),
			},
		],
		[e, lang, sheet],
	);

	const spread = useMemo<ColumnDef<{ month: string; days: number | null; cost: number | null }>[]>(
		() => [
			{
				id: "month",
				header: e.month,
				meta: { width: "12rem" },
				cell: ({ row }) => row.original.month,
			},
			{
				id: "days",
				header: e.days,
				meta: { width: "7rem", numeric: true },
				cell: ({ row }) => figure(row.original.days, lang),
			},
			{
				id: "cost",
				header: e.cost,
				meta: { width: "9rem", numeric: true },
				cell: ({ row }) => money(row.original.cost, sheet?.sheet.currency ?? "EUR", lang),
			},
		],
		[e, lang, sheet],
	);

	const currency = sheet?.sheet.currency ?? "EUR";
	// shortcut: one currency for the portfolio, the one of the chosen sheet. Mixed currencies need a rate.
	const portfolioCols = useMemo<ColumnDef<{ name: string } & Totals>[]>(
		() => [
			{
				id: "name",
				header: e.sheet,
				meta: { width: "12rem" },
				cell: ({ row }) => row.original.name,
			},
			{
				id: "days",
				header: e.days,
				meta: { width: "7rem", numeric: true },
				cell: ({ row }) => figure(row.original.days, lang),
			},
			...(["cost", "price", "margin"] as const).map(
				(k): ColumnDef<{ name: string } & Totals> => ({
					id: k,
					header: k === "margin" ? e.marginAmount : e[k],
					meta: { width: "9rem", numeric: true },
					cell: ({ row }) => money(row.original[k], currency, lang),
				}),
			),
		],
		[e, lang, currency],
	);

	if (active === undefined || sheets.isLoading) return null;
	if (active === null) return <NoProject title={t.tabs.work.estimates} />;

	const openTask = (taskId: string | null) => {
		if (!slug) return;
		setSelected(taskId);
		openDetail(e.task, <TaskForm key={taskId ?? "new"} slug={slug} taskId={taskId} />);
	};
	const openSheet = (target: string | null) =>
		openDetail(e.sheet, <SheetForm key={target ?? "new"} slug={target} onSaved={setChosen} />);

	const importExcel = () =>
		run(async () => {
			const path = await pickWorkbook();
			if (path) setExcel({ path, preview: await act.previewExcel(path, null) });
		});
	const exportExcel = () =>
		run(async () => {
			if (!slug) return;
			const path = await saveWorkbook(slug);
			if (!path) return;
			await act.exportExcel(slug, path);
			setNote(format(e.exported, { path }));
		});

	if (locked && seal)
		return (
			<ListDetail title={t.tabs.work.estimates}>
				<div className="flex items-center gap-2 p-4">
					<LockClosedIcon size={14} />
					<span className="text-ui text-n-11">{e.locked}</span>
					<SealBar state={seal} />
				</div>
			</ListDetail>
		);
	if (list.length === 0)
		return (
			<ListDetail title={t.tabs.work.estimates}>
				<div className="flex flex-col gap-2 p-4">
					<EmptyState
						action={{
							label: e.newSheet,
							icon: <PlusIcon size={14} />,
							onClick: () => openSheet(null),
						}}
					/>
				</div>
			</ListDetail>
		);

	const item = list.find((s) => s.slug === slug);
	const totals = sheet?.totals;
	return (
		<ListDetail
			title={t.tabs.work.estimates}
			toolbar={
				<>
					<Select
						label={e.sheet}
						value={slug ?? ""}
						onValueChange={(v) => (v === NEW ? openSheet(null) : setChosen(v))}
						items={[
							...list.map((s) => ({ value: s.slug, label: s.name ?? s.slug })),
							{ value: NEW, label: e.newSheet },
						]}
					/>
					<IconButton label={e.settings} disabled={!sheet} onClick={() => openSheet(slug)}>
						<Cog6ToothIcon size={14} />
					</IconButton>
					<ViewTabs
						label={t.tabs.work.estimates}
						value={view}
						onValueChange={setView}
						tabs={[
							{ value: "backlog", label: e.views.backlog },
							{ value: "summary", label: e.views.summary },
							{ value: "spread", label: e.views.spread },
							{ value: "portfolio", label: e.views.portfolio },
						]}
					/>
					<span className="flex-1" />
					{seal ? <SealBar state={seal} /> : null}
					<IconButton label={e.import} onClick={() => void importExcel()}>
						<ArrowDownTrayIcon size={14} />
					</IconButton>
					<IconButton label={e.export} disabled={!sheet} onClick={() => void exportExcel()}>
						<ArrowUpTrayIcon size={14} />
					</IconButton>
					<Button variant="primary" disabled={!sheet} onClick={() => openTask(null)}>
						<PlusIcon size={14} />
						{e.task}
					</Button>
				</>
			}
		>
			{error ? (
				<p role="alert" className="px-3 py-1 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{note ? (
				<p role="status" className="px-3 py-1 font-mono text-12 text-n-11">
					{note}
				</p>
			) : null}
			{item?.state === "invalid" ? (
				<p role="alert" className="px-3 py-1 text-ui text-danger-text">
					{item.error}
				</p>
			) : null}
			{view === "backlog" && sheet ? (
				lines.length === 0 ? (
					<div className="p-4">
						<EmptyState
							action={{
								label: e.task,
								icon: <PlusIcon size={14} />,
								onClick: () => openTask(null),
							}}
						/>
					</div>
				) : (
					<DataTable
						label={e.views.backlog}
						data={lines}
						columns={columns}
						rowId={(r) => r.task.id}
						group={(r) => r.feature.name}
						onOpen={(r) => openTask(r.task.id)}
						selected={selected}
					/>
				)
			) : null}
			{view === "summary" && sheet && totals ? (
				<div className="flex flex-col gap-4 p-4">
					<dl className="flex flex-wrap gap-x-8 gap-y-4">
						<Stat label={e.days} value={figure(totals.days, lang)} />
						<Stat label={e.cost} value={money(totals.cost, currency, lang)} />
						<Stat label={e.price} value={money(totals.price, currency, lang)} />
						<Stat label={e.marginAmount} value={money(totals.margin, currency, lang)} />
						<Stat
							label={e.margin}
							value={
								sheet.sheet.marginRate == null
									? "—"
									: `${figure(sheet.sheet.marginRate * 100, lang)} %`
							}
						/>
					</dl>
					{totals.unrated.length > 0 ? (
						<p className="flex items-center gap-2 text-ui">
							<StatusDot status="warning" label={e.unrated} />
							{e.unrated}: {totals.unrated.join(", ")}
						</p>
					) : null}
				</div>
			) : null}
			{view === "spread" && sheet ? (
				<DataTable
					label={e.views.spread}
					data={sheet.spread.map((m) => ({ month: m.month, days: m.days, cost: m.cost }))}
					columns={spread}
					rowId={(r) => r.month}
					footer={[e.total, figure(totals?.days, lang), money(totals?.cost, currency, lang)]}
				/>
			) : null}
			{view === "portfolio" && portfolio ? (
				<DataTable
					label={e.views.portfolio}
					data={portfolio.sheets.map(([name, tt]) => ({ name, ...tt }))}
					columns={portfolioCols}
					rowId={(r) => r.name}
					footer={[
						e.total,
						figure(portfolio.total.days, lang),
						money(portfolio.total.cost, currency, lang),
						money(portfolio.total.price, currency, lang),
						money(portfolio.total.margin, currency, lang),
					]}
				/>
			) : null}
			{excel ? (
				<ExcelDialog
					path={excel.path}
					preview={excel.preview}
					slugs={list.map((s) => s.slug)}
					initial={slug ?? ""}
					onClose={() => setExcel(null)}
					onDone={(s) => {
						setChosen(s);
						setExcel(null);
					}}
				/>
			) : null}
		</ListDetail>
	);
}
