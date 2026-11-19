import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { PageExport } from "@/features/reports/page-export";
import { NoProject } from "@/features/shell/no-project";
import { EstimateBacklog, EstimateBulk } from "@/features/work/estimate-backlog";
import { CONTROLS, SheetForm, TaskForm } from "@/features/work/estimate-forms";
import { useGuard } from "@/features/work/guard";
import { SealCard } from "@/features/work/seal";
import { SheetCard, useSheetActions } from "@/features/work/sheet-menu";
import { format, useI18n } from "@/lib/i18n";
import { pickWorkbook } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
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
import { Select } from "@/ui/atoms/select";
import { CurrencyIcon, PlusIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { CostingView } from "./costing-cards";
import { EstimateAgent } from "./estimate-agent";
import { PersonCard, SheetsView, SplitCard } from "./estimate-cards";
import { ExcelImport } from "./excel-page";

const VIEWS = ["tasks", "summary", "spread", "portfolio", "costing"] as const;
type View = (typeof VIEWS)[number];
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
	const view: View = VIEWS.find((v) => v === search.tab) ?? "tasks";
	const names = new Map(list.map((s) => [s.slug, s.name ?? s.slug]));
	const actions = useSheetActions({
		view: sheet,
		slugs: list.map((s) => s.slug),
		onRename: () => go({ page: "sheet", task: undefined }),
		onChosen: (next) => go({ ...home, sheet: next ?? undefined }),
		run,
	});

	const icon = <CurrencyIcon size={16} />;
	if (active === undefined || sheets.isLoading) return <Loading title={title} icon={icon} />;
	if (active === null) return <NoProject title={title} icon={icon} />;

	const frame = (head: ReactNode, body: ReactNode) => (
		<div className="flex min-h-0 flex-1 flex-col">
			{head}
			{body}
		</div>
	);
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
		);
	if (sub && slug && sheet) {
		const task = sheet.sheet.features.flatMap((f) => f.tasks).find((x) => x.id === taskId);
		return frame(
			<PageHeader title={task?.name ?? p.newTask} back={back} />,
			body(
				<>
					<ErrorNotice error={failure} className="pb-2" />
					<TaskForm
						key={taskId ?? "new"}
						slug={slug}
						view={sheet}
						taskId={taskId}
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
		);
	}

	const item = list.find((s) => s.slug === slug);
	const frozen = sheet?.sheet.frozen === true;
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
				...actions.map((a) => ({ label: a.label, disabled: a.disabled, onClick: a.onClick })),
			]}
		/>,
		<>
			<div className={`flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-6 ${CONTROLS}`}>
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
				<Select
					label={e.sheet}
					value={slug ?? ""}
					onValueChange={(sheet) => go({ sheet })}
					items={list.map((s) => ({ value: s.slug, label: s.name ?? s.slug }))}
				/>
				<RightButton right="work.edit" onClick={() => go({ page: "new-sheet" })}>
					{e.newSheet}
				</RightButton>
				<RightButton right="work.edit" onClick={() => void importExcel()}>
					{p.importExcel}
				</RightButton>
				<PageExport
					page="costing"
					disabled={!sheet}
					extra={
						slug
							? [
									{
										id: "sheet",
										label: t.reports.sheet,
										save: {
											name: slug,
											ext: "xlsx",
											job: (path) => act.exportExcel(slug, path),
										},
									},
								]
							: []
					}
				/>
				{/* The seal is one card, in Costing. */}
				{view === "costing" ? null : (
					<Button
						variant={seal?.sealed ? "secondary" : "primary"}
						onClick={() => go({ tab: "costing" })}
					>
						{seal?.sealed ? p.openSeal : t.work.seal.seal}
					</Button>
				)}
				{view === "tasks" && slug && sheet ? (
					<EstimateAgent slug={slug} view={sheet} ids={[...picked]} />
				) : null}
			</div>
			<ErrorNotice error={failure} className="px-4 py-1" />
			{item?.state === "invalid" ? (
				<p role="alert" className="px-4 py-1 text-ui text-danger-text">
					{item.error}
				</p>
			) : null}
			{slug && sheet ? (
				<div className="min-h-0 flex-1 overflow-y-auto">
					{view === "tasks" ? (
						<div className="flex flex-wrap items-start gap-6 px-4 pb-10">
							<EstimateBacklog
								slug={slug}
								view={sheet}
								tools={tools}
								picked={picked}
								onPicked={setPicked}
								onOpen={(id) => go(id ? { task: id } : { page: "task" })}
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
				</div>
			) : null}
		</>,
	);
}
