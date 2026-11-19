import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDocumentExports } from "@/features/knowledge/documents-parts";
import { NoProject } from "@/features/shell/no-project";
import { ofKind, useDesignList } from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { type Area, RightButton, useRights } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { DocumentTextIcon } from "@/ui/icons";
import { PageHeader } from "@/ui/molecules/page-header";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { type ExportItem, useExportRun } from "./export-menu";
import { type ExportPage, useExportItems } from "./page-export";

type Format = "docx" | "xlsx" | "picture";
/** A report of the list: its export, or the page that holds it when the export needs a choice of that page. */
type Report = { item: ExportItem; format: Format; page?: { to: string; label: string } };

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

/**
 * Library / Reports: each export of the pages on one page, with one format choice
 * (`spec:app-redesign#REQ-003`). The Export menu of each page stays.
 */
export function Reports() {
	const { t } = useI18n();
	const r = t.reports;
	const active = useActiveProject().data;
	const pages = useExportItems();
	const documents = useDocumentExports();
	const { pick, status } = useExportRun();
	const [shown, setShown] = useState<"all" | Format>("all");
	const { level } = useRights();
	const flows = ofKind(useDesignList().data, "flow").length;

	// A report shows only to a role that sees the page of its export (`spec:app-redesign#REQ-006`).
	const sees = (page: ExportPage) => level(AREA[page]) !== "none";
	const plan = { to: "/plan/timeline", label: t.tabs.work.plan };
	const reports: Report[] = [
		...[
			...(["documents", "workDone", "costing", "flows", "raid", "security"] as const)
				// As on its page, the Network flows export needs a flow file.
				.filter((page) => sees(page) && (page !== "flows" || flows > 0))
				.flatMap((page) => pages[page]),
			...(sees("documents") ? documents : []).map(
				(d): ExportItem => ({
					id: d.id,
					label: d.label,
					right: "knowledge.edit",
					save: { name: d.id, ext: d.ext, job: d.job },
				}),
			),
		].map((item) => ({
			item,
			format: item.save ? formatOf(item.save.ext) : (FORM_FORMAT[item.id] ?? "docx"),
		})),
		// These exports need the sheet that the person chose on the page.
		...(sees("plan")
			? [
					...pages.plan.map(
						(item): Report => ({ item, format: formatOf(item.save?.ext ?? ""), page: plan }),
					),
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

	const title = t.library.views.reports;
	const icon = <DocumentTextIcon size={16} />;
	if (active === null) return <NoProject title={title} icon={icon} />;
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
			<PageHeader
				title={title}
				icon={icon}
				action={
					<SectionSwitch
						label={r.format}
						items={(["all", "docx", "xlsx", "picture"] as const).map((id) => ({
							id,
							label: r.formats[id],
							current: shown === id,
						}))}
						onSelect={(id) => setShown(id as typeof shown)}
					/>
				}
			/>
			<div className="flex flex-wrap items-center gap-2 px-4 empty:hidden">{status}</div>
			<ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 px-4">
				{reports
					.filter((x) => shown === "all" || x.format === shown)
					.map(({ item, page }) => {
						const action = item.form ? r.fill : r.export;
						return (
							<li
								key={item.id}
								className="flex flex-col justify-between gap-3 rounded-xl bg-surface-2 p-4 shadow-1"
							>
								<h2 className="text-16 font-semibold text-n-12">{item.label}</h2>
								{page ? (
									<Link to={page.to} className={cn(buttonVariants(), "min-h-control")}>
										{format(r.openPage, { page: page.label })}
									</Link>
								) : item.right ? (
									<RightButton
										right={item.right}
										className="min-h-control"
										aria-label={`${action} ${item.label}`}
										onClick={() => void pick(item)}
									>
										{action}
									</RightButton>
								) : (
									<Button
										className="min-h-control"
										aria-label={`${action} ${item.label}`}
										onClick={() => void pick(item)}
									>
										{action}
									</Button>
								)}
							</li>
						);
					})}
			</ul>
		</div>
	);
}
