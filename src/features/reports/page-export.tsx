import { useI18n } from "@/lib/i18n";
import { commands, type ExportText, unwrap } from "@/lib/ipc";
import { type ExportItem, ExportMenu } from "./export-menu";
import { renderViews } from "./export-views";

export type ExportPage =
	| "documents"
	| "workDone"
	| "costing"
	| "flows"
	| "raid"
	| "security"
	| "plan";

/**
 * The exports of each page. `slug` is the estimate sheet of the plan. Each item calls one Rust
 * command, and a Rust refusal shows with its error action.
 */
export function useExportItems(slug?: string): Record<ExportPage, ExportItem[]> {
	const { t } = useI18n();
	const r = t.reports;
	const words = (title: string, sections: string[] = []): ExportText => ({
		title,
		...r.text,
		sections,
	});
	const sheet = (
		id: string,
		label: string,
		job: (text: ExportText, path: string) => Promise<unknown>,
		ext: "xlsx" | "svg" = "xlsx",
	): ExportItem => ({
		id,
		label,
		save: { name: id, ext, job: (path) => job(words(label), path) },
	});
	return {
		documents: [
			{
				id: "dossier-complete",
				label: r.dossierComplete,
				// A form asks the title, the client and the day first. Export keeps the default values.
				form: true,
				save: {
					name: "dossier",
					ext: "docx",
					job: async (path) =>
						unwrap(
							commands.exportDossierCompleteFile(
								words(r.dossierComplete, r.dossierSections),
								await renderViews(),
								path,
								true,
							),
						),
				},
			},
			{
				id: "change-request",
				label: r.changeRequest,
				form: true,
				// One click with the default title and versions, as the form starts.
				quick: async (out) => {
					const ask = [r.changeRequest, "main", "HEAD", [] as string[], true] as const;
					const o = await unwrap(
						out === "pdf"
							? commands.exportChangeRequestPdfFiles(...ask)
							: commands.exportChangeRequestFiles(...ask),
					);
					return [o.markdown, out === "pdf" ? (o.pdf ?? "") : o.docx];
				},
			},
		],
		workDone: [
			{
				id: "work-done",
				label: r.workDone,
				form: true,
			},
		],
		costing: [
			sheet("costing", r.costing, (x, p) => unwrap(commands.exportCostingFile(x, p, true))),
		],
		flows: [sheet("flows", r.flows, (x, p) => unwrap(commands.exportFlowsFile(x, p, true)))],
		raid: [sheet("raid", r.raid, (x, p) => unwrap(commands.exportRaidFile(x, p, true)))],
		security: [
			sheet("security", r.security, (x, p) => unwrap(commands.exportSecurityFile(x, p, true))),
		],
		plan: [
			sheet("schedule", r.schedule, (x, p) =>
				unwrap(commands.exportScheduleFile(x, slug ?? "", p, true)),
			),
			sheet(
				"gantt",
				r.gantt,
				(x, p) => unwrap(commands.exportGanttFile(x, slug ?? "", p, true)),
				"svg",
			),
		],
	};
}

/** The Export menu of a page, one line to mount. */
export function PageExport({
	page,
	slug,
	disabled,
	extra = [],
}: {
	page: ExportPage;
	slug?: string;
	disabled?: boolean;
	/** Items that the page adds before the standard ones. */
	extra?: ExportItem[];
}) {
	const items = useExportItems(slug);

	return (
		<ExportMenu
			items={[...extra, ...items[page]]}
			disabled={disabled || (page === "plan" && !slug)}
		/>
	);
}
