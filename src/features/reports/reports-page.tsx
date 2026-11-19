import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDocumentExports } from "@/features/knowledge/documents-parts";
import { LibraryPage, LinkedRow } from "@/features/library/page-parts";
import { NoProject } from "@/features/shell/no-project";
import { visibleSections } from "@/features/shell/places";
import { tabLabel } from "@/features/shell/spaces";
import { ofKind, useDesignList } from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { type Area, RightButton, useRights } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Segmented } from "@/ui/atoms/segmented";
import { DocumentTextIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { Row } from "@/ui/molecules/row";
import { type ExportItem, useExportRun } from "./export-menu";
import { type ExportPage, useExportItems } from "./page-export";

type Format = "docx" | "xlsx" | "picture";
/** A report of the list: its export, or the page that holds it when the export needs a choice of that page. */
type Report = {
	item: ExportItem;
	/** The name on the Reports page. */
	name: string;
	format: Format;
	page?: { to: string; label: string };
	/** A document of Documents: it shows in "Written for you". */
	forYou?: boolean;
};

const formatOf = (ext: string): Format => (ext === "docx" || ext === "xlsx" ? ext : "picture");
/** The file that a form writes: the form holds no `save`. */
const FORM_FORMAT: Record<string, Format> = { "change-request": "docx", "work-done": "xlsx" };
/** The area of the page that holds each export. Keep in step with `REPORT_VIEWS` of the places. */
const AREA: Record<ExportPage, Area> = {
	documents: "knowledge",
	workDone: "code",
	costing: "work",
	flows: "design",
	raid: "specs",
	security: "code",
	plan: "work",
};

/** Each report that the role sees, in the order of the Reports page. */
export function useReports(): Report[] {
	const { t } = useI18n();
	const r = t.reports;
	const pages = useExportItems();
	const documents = useDocumentExports();
	const { level } = useRights();
	const flows = ofKind(useDesignList().data, "flow").length;

	// A report shows only to a role that sees the page of its export (`spec:app-redesign#REQ-006`).
	const sees = (page: ExportPage) => level(AREA[page]) !== "none";
	const plan = { to: "/plan/timeline", label: t.tabs.work.plan };
	const reports: Omit<Report, "name">[] = [
		...(["documents", "workDone", "costing", "flows", "raid", "security"] as const)
			// As on its page, the Network flows export needs a flow file.
			.filter((page) => sees(page) && (page !== "flows" || flows > 0))
			.flatMap((page) => pages[page])
			.map((item) => ({
				item,
				format: item.save ? formatOf(item.save.ext) : (FORM_FORMAT[item.id] ?? "docx"),
			})),
		...(sees("documents") ? documents : []).map((d) => ({
			item: {
				id: d.id,
				label: d.label,
				right: "knowledge.edit" as const,
				save: { name: d.id, ext: d.ext, job: d.job },
			},
			format: formatOf(d.ext),
			forYou: true,
		})),
		// These exports need the sheet that the person chose on the page.
		...(sees("plan")
			? [
					...pages.plan.map((item) => ({
						item,
						format: formatOf(item.save?.ext ?? ""),
						page: plan,
					})),
					{
						item: { id: "png", label: t.costing.plan.png },
						format: "picture",
						page: plan,
					} as const,
					{
						item: { id: "sheet", label: r.sheet },
						format: "xlsx",
						page: { to: "/plan/estimates", label: t.tabs.work.estimates },
					} as const,
				]
			: []),
	];

	const names: Record<string, string> = r.names;
	return reports.map((x) => ({ ...x, name: names[x.item.id] ?? x.item.label }));
}

/**
 * Library / Reports: each export of the pages on one page, with one format choice
 * (`spec:app-redesign#REQ-003`). The Export menu of each page stays.
 */
export function Reports() {
	const { t } = useI18n();
	const r = t.reports;
	const active = useActiveProject().data;
	const reports = useReports();
	const { pick, status } = useExportRun();
	const [shown, setShown] = useState<"all" | Format>("all");
	const { level } = useRights();
	const dashboards = visibleSections("library", level).find(([, tab]) => tab === "dashboards");
	const forYou = reports.filter((x) => x.forYou);

	const title = t.library.views.reports;
	const icon = <DocumentTextIcon size={16} />;
	if (active === null) return <NoProject title={title} icon={icon} />;
	return (
		<LibraryPage
			title={title}
			action={
				<div>
					<Segmented
						label={r.format}
						value={shown}
						onValueChange={setShown}
						items={(["all", "docx", "xlsx", "picture"] as const).map((value) => ({
							value,
							label: r.formats[value],
						}))}
					/>
				</div>
			}
		>
			<div className="flex flex-wrap items-center gap-2 empty:hidden">{status}</div>
			<ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-3.5">
				{reports
					.filter((x) => !x.forYou && (shown === "all" || x.format === shown))
					.map(({ item, name, page }) => (
						<li
							key={item.id}
							className="flex flex-col gap-3 rounded-lg bg-surface-2 p-4.5 shadow-2"
						>
							<h2 className="text-17 font-semibold text-n-12">{name}</h2>
							{page ? (
								<Link to={page.to} className={cn(buttonVariants(), "mt-auto")}>
									{format(r.openPage, { page: page.label })}
								</Link>
							) : item.form ? (
								<Link
									to="/library/reports/$form"
									params={{ form: item.id }}
									aria-label={`${r.fill} ${name}`}
									className={cn(buttonVariants(), "mt-auto")}
								>
									{r.fill}
								</Link>
							) : (
								<Button
									className="mt-auto"
									aria-label={`${r.export} ${name}`}
									onClick={() => void pick(item)}
								>
									{r.export}
								</Button>
							)}
						</li>
					))}
			</ul>
			{forYou.length ? (
				<Card className="py-2">
					<section aria-label={r.forYou}>
						<div className="flex items-center gap-3 px-6 pt-3.5 pb-1.5">
							<Avatar agent size="s" name="Shipyard" />
							<h2 className="text-13 font-semibold text-n-11">{r.forYou}</h2>
						</div>
						{forYou.map(({ item, name }) => (
							<Row key={item.id}>
								<span className="flex-[1_1_200px] font-medium">{name}</span>
								<Link
									to="/library/documents"
									aria-label={`${t.context.open} ${name}`}
									className={buttonVariants()}
								>
									{t.context.open}
								</Link>
								<RightButton
									right="knowledge.edit"
									variant="primary"
									aria-label={`${r.writeIt} ${name}`}
									onClick={() => void pick(item)}
								>
									{r.writeIt}
								</RightButton>
							</Row>
						))}
					</section>
				</Card>
			) : null}
			{dashboards ? (
				<Card className="py-2">
					<LinkedRow
						label={tabLabel(t, dashboards[0], "dashboards")}
						render={(p) => <Link to="/library/dashboards" {...p} />}
					/>
				</Card>
			) : null}
		</LibraryPage>
	);
}
