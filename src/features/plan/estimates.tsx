import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useContext, useMemo, useState } from "react";
import { type ExportItem, useExportRun } from "@/features/reports/export-menu";
import { PageExport, useExportItems } from "@/features/reports/page-export";
import { NoProject } from "@/features/shell/no-project";
import { EstimateBacklog, EstimateBulk } from "@/features/work/estimate-backlog";
import { CONTROLS, SheetForm, TaskForm } from "@/features/work/estimate-forms";
import { useGuard } from "@/features/work/guard";
import { SealCard } from "@/features/work/seal";
import { SheetCard, useSheetActions } from "@/features/work/sheet-menu";
import { format, useI18n } from "@/lib/i18n";
import { pickWorkbook } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { RightButton, useRights } from "@/lib/rights";
import { useViewState } from "@/lib/shell/view-state";
import {
	figure,
	type Preview,
	usePortfolio,
	useSealState,
	useSheet,
	useSheets,
	useWorkActions,
} from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Segmented } from "@/ui/atoms/segmented";
import { CurrencyIcon, PlusIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { MenuButton } from "@/ui/molecules/menu-button";
import { PageHeader, PageSwitchContext } from "@/ui/molecules/page-header";
import { CostingView } from "./costing-cards";
import { PersonCard, SheetsView, SplitCard } from "./estimate-cards";
import { ExcelImport } from "./excel-page";

type View = "tasks" | "summary" | "spread" | "portfolio" | "costing";
const VIEWS: readonly View[] = ["tasks", "summary", "spread", "portfolio", "costing"];
/** The address of the page of days (`tab=sheets`) opens the Summary. */
const ALIAS: Record<string, View> = { sheets: "summary" };
type Search = { sheet?: unknown; page?: unknown; task?: unknown; tab?: unknown };

/**
 * Plan / Estimates (`spec:app-redesign#REQ-019`): the sheet of one lot. The address holds the
 * sheet (`sheet`), the view (`tab`: tasks, summary, spread, portfolio, costing) and the sub-page:
 * one task (`task`, or `page=task` for a new one), the import from Excel (`page=import`), and the
 * settings of the sheet (`page=sheet`, or `page=new-sheet`).
 */
export function PlanEstimates() {
	const { t, lang } = useI18n();
	const e = t.work.estimates;
	const p = t.costing.estimate;
	const title = t.planPlace.views.estimates;
	const active = useActiveProject().data;
	const sheets = useSheets();
	const seal = useSealState().data;
	const portfolio = usePortfolio().data;
	const act = useWorkActions();
	const { failure, run } = useGuard();
	const navigate = useNavigate();
	const search: Search = useSearch({ strict: false });
	const go = (patch: { sheet?: string; page?: string; task?: string; tab?: string }) =>
		void navigate({ search: (prev: object) => ({ ...prev, ...patch }) } as never);
	/** The list of the sheet, with no sub-page. */
	const home = { page: undefined, task: undefined };
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [tools, setTools] = useViewState("estimate-tools", false);
	const [excel, setExcel] = useState<{ path: string; preview: Preview } | null>(null);
	const list = sheets.data ?? [];
	const chosen = typeof search.sheet === "string" ? search.sheet : null;
	const slug = chosen && list.some((s) => s.slug === chosen) ? chosen : (list[0]?.slug ?? null);
	const current = useSheet(
		slug && list.find((s) => s.slug === slug)?.state === "ready" ? slug : null,
	);
	const sheet = current.data;
	const locked = seal ? seal.sealed && !seal.unlocked : false;
	const view: View =
		VIEWS.find((v) => v === search.tab) ??
		(typeof search.tab === "string" ? ALIAS[search.tab] : undefined) ??
		"tasks";
	const names = new Map(list.map((s) => [s.slug, s.name ?? s.slug]));
	const actions = useSheetActions({
		view: sheet,
		slugs: list.map((s) => s.slug),
		onRename: () => go({ page: "sheet", task: undefined }),
		onChosen: (next) => go({ ...home, sheet: next ?? undefined }),
		run,
	});

	const { can, gate } = useRights();
	const exportRun = useExportRun();
	const exportItems = useExportItems().costing;
	const [amounts, setAmounts] = useState(false);
	const [taskMore, setTaskMore] = useState(false);
	const slot = useContext(PageSwitchContext);
	// A sub-page with a back link has no section switch: it claims the switch and draws none.
	const bare = useMemo(() => slot && { ...slot, node: null }, [slot]);
	/** The exports of the page: the workbook of the sheet, then the standard ones. */
	const sheetExport: ExportItem[] = slug
		? [
				{
					id: "sheet",
					label: t.reports.sheet,
					save: { name: slug, ext: "xlsx", job: (path) => act.exportExcel(slug, path) },
				},
			]
		: [];

	const icon = <CurrencyIcon size={16} />;
	if (active === undefined || sheets.isLoading) return <Loading title={title} icon={icon} />;
	if (active === null) return <NoProject title={title} icon={icon} />;

	const frame = (head: ReactNode, body: ReactNode, sub = false) => {
		const page = (
			<div className="flex min-h-0 flex-1 flex-col">
				{head}
				{body}
			</div>
		);
		return sub && bare ? (
			<PageSwitchContext.Provider value={bare}>{page}</PageSwitchContext.Provider>
		) : (
			page
		);
	};
	const back = (
		<BackLink
			label={title}
			render={(props) => (
				<Link to="/plan/estimates" search={{ sheet: slug ?? undefined } as never} {...props} />
			)}
		/>
	);
	const body = (children: ReactNode) => (
		<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-10">{children}</div>
	);

	// A locked sheet shows no number: only the seal.
	if (locked && seal)
		return frame(
			<PageHeader title={title} />,
			<div className="max-w-md px-4">
				<SealCard state={seal} />
			</div>,
		);
	if (search.page === "new-sheet")
		return frame(
			<PageHeader title={e.newSheet} back={back} />,
			body(<SheetForm slug={null} onSaved={(s) => go({ ...home, sheet: s })} />),
			true,
		);
	if (list.length === 0)
		return frame(
			<PageHeader title={title} />,
			<div className="p-4">
				<EmptyState
					title={t.empty.sheets}
					action={{
						label: e.newSheet,
						icon: <PlusIcon size={14} />,
						onClick: () => go({ page: "new-sheet" }),
					}}
				/>
			</div>,
		);

	const importExcel = () =>
		run(async () => {
			const path = await pickWorkbook();
			if (!path) return;
			setExcel({ path, preview: await act.previewExcel(path, null) });
			go({ page: "import", task: undefined });
		});

	if (search.page === "import")
		return frame(
			<PageHeader title={t.costing.excel.title} back={back} />,
			<>
				<ErrorNotice error={failure} className="px-4 py-1" />
				<ExcelImport
					file={excel}
					names={names}
					onChoose={() => void importExcel()}
					onFile={setExcel}
					onCancel={() => go(home)}
					onDone={(s) => {
						setExcel(null);
						go({ ...home, sheet: s });
					}}
				/>
			</>,
		);

	const taskId = typeof search.task === "string" ? search.task : null;
	const sub = taskId !== null || search.page === "task" || search.page === "sheet";
	if (sub && slug && !sheet) return <Loading title={title} icon={icon} />;
	if (search.page === "sheet" && slug && sheet)
		return frame(
			<PageHeader title={t.costing.sheet.rename} back={back} />,
			body(<SheetForm key={slug} slug={slug} onSaved={() => go(home)} />),
			true,
		);
	if (sub && slug && sheet) {
		const task = sheet.sheet.features.flatMap((f) => f.tasks).find((x) => x.id === taskId);
		return frame(
			<PageHeader
				title={task?.name ?? p.newTask}
				back={back}
				menu={task ? [{ label: p.taskMore, onClick: () => setTaskMore(!taskMore) }] : undefined}
			/>,
			body(
				<>
					<ErrorNotice error={failure} className="pb-2" />
					<TaskForm
						key={taskId ?? "new"}
						slug={slug}
						view={sheet}
						taskId={taskId}
						more={taskMore}
						onSaved={() => go(home)}
						onRemoved={() => go(home)}
						side={
							<>
								<EstimateBulk slug={slug} view={sheet} picked={picked} onPicked={setPicked} />
								<SheetCard actions={actions} onSeal={() => go({ ...home, tab: "costing" })} />
							</>
						}
					/>
				</>,
			),
			true,
		);
	}

	const item = list.find((s) => s.slug === slug);
	const frozen = sheet?.sheet.frozen === true;
	const newSheet = () => go({ page: "new-sheet" });
	// The seal buttons wait for the sheet, so they keep their place once the page shows them.
	const seals =
		view === "costing" || !sheet ? null : (
			<Button onClick={() => go({ tab: "costing" })}>
				{seal?.sealed ? p.openSeal : t.work.seal.seal}
			</Button>
		);
	const lots = list.map((s) => ({
		id: s.slug,
		label: s.name ?? s.slug,
		onSelect: () => go({ sheet: s.slug }),
	}));
	return frame(
		<PageHeader
			title={
				!sheet
					? title
					: view === "costing"
						? format(p.costs, { name: sheet.sheet.name ?? sheet.slug })
						: format(t.costing.title, {
								name: sheet.sheet.name ?? sheet.slug,
								days: figure(sheet.totals.days, lang),
							})
			}
			chips={frozen ? <Badge variant="info">{t.costing.sheet.frozen}</Badge> : null}
			menu={[
				{ label: p.tools, onClick: () => setTools(!tools) },
				// A control that the design of the page does not show waits here.
				...(view === "tasks"
					? [
							{
								label: p.addTask,
								disabled: frozen || !can("work.edit"),
								reason: gate("work.edit").reason,
								onClick: () => go({ page: "task" }),
							},
							...(sheet ? [...sheetExport, ...exportItems] : []).map((x) => ({
								label: `${t.reports.export}: ${x.label}`,
								onClick: () => void exportRun.pick(x),
							})),
						]
					: []),
				...(view === "costing"
					? [
							{ label: p.moreAmounts, onClick: () => setAmounts(!amounts) },
							{ label: e.newSheet, disabled: !can("work.edit"), onClick: newSheet },
							{
								label: p.importExcel,
								disabled: !can("work.edit"),
								onClick: () => void importExcel(),
							},
							...lots.map((l) => ({
								label: format(p.lot, { name: l.label }),
								onClick: l.onSelect,
							})),
						]
					: []),
				...actions.map((a) => ({ label: a.label, disabled: a.disabled, onClick: a.onClick })),
			]}
		/>,
		<>
			<div
				className={`flex shrink-0 flex-wrap items-center gap-2 px-4 pb-6 [&_button]:px-3 ${CONTROLS}`}
			>
				<span className="mr-auto">
					<Segmented
						label={title}
						value={view}
						onValueChange={(tab) => go({ tab })}
						items={[
							{ value: "tasks", label: p.tabs.tasks },
							{ value: "summary", label: e.views.summary },
							{ value: "spread", label: e.views.spread },
							{ value: "portfolio", label: e.views.portfolio },
							{ value: "costing", label: p.tabs.costing },
						]}
					/>
				</span>
				<MenuButton label={format(p.lot, { name: names.get(slug ?? "") ?? "" })} items={lots} />
				<RightButton right="work.edit" onClick={newSheet}>
					{e.newSheet}
				</RightButton>
				<RightButton right="work.edit" onClick={() => void importExcel()}>
					{p.importExcel}
				</RightButton>
				<PageExport page="costing" disabled={!sheet} extra={sheetExport} />
				{seals}
			</div>
			<div className="flex flex-wrap items-center gap-2 px-4 empty:hidden">{exportRun.status}</div>
			<ErrorNotice error={failure} className="px-4 py-1" />
			{item?.state === "invalid" ? (
				<p role="alert" className="px-4 py-1 text-ui text-danger-text">
					{item.error}
				</p>
			) : null}
			{slug && sheet ? (
				<section
					aria-label={title}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll region takes the focus for the keyboard
					tabIndex={0}
					className="min-h-0 flex-1 overflow-y-auto"
				>
					{view === "tasks" ? (
						<div className="flex flex-wrap items-start gap-6 px-4 pb-10">
							<EstimateBacklog
								slug={slug}
								view={sheet}
								tools={tools}
								onTools={() => setTools(true)}
								picked={picked}
								onPicked={setPicked}
								onOpen={(id) => go({ task: id })}
								className="min-w-0 flex-[3_1_520px]"
							/>
							<div className="flex min-w-0 flex-[2_1_300px] flex-col gap-6">
								<SplitCard view={sheet} />
								<PersonCard slug={slug} />
								<EstimateBulk slug={slug} view={sheet} picked={picked} onPicked={setPicked} />
							</div>
						</div>
					) : view === "costing" ? (
						<CostingView
							view={sheet}
							seal={seal}
							portfolio={portfolio}
							names={names}
							amounts={amounts}
							onSheet={() => go({ page: "sheet" })}
						/>
					) : (
						<SheetsView
							view={sheet}
							seal={seal}
							portfolio={portfolio}
							project={active.name}
							names={names}
						/>
					)}
				</section>
			) : null}
		</>,
	);
}
