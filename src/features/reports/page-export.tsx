import { useI18n } from "@/lib/i18n";
import { commands, type ExportText, saveAs, unwrap } from "@/lib/ipc";
import { type ExportItem, ExportMenu } from "./export-menu";
import { ChangeRequestForm, WorkDoneForm } from "./forms";

export type ExportPage =
	| "documents"
	| "workDone"
	| "costing"
	| "flows"
	| "raid"
	| "security"
	| "plan";

/**
 * The Export menu of a page, one line to mount. `slug` is the estimate sheet of the plan. Each
 * item calls one Rust command, and a Rust refusal shows with its error action.
 */
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
	const items: Record<ExportPage, ExportItem[]> = {
		documents: [
			{
				id: "dossier-complete",
				label: r.dossierComplete,
				save: {
					name: "dossier",
					ext: "docx",
					job: (path) =>
						unwrap(
							commands.exportDossierCompleteFile(
								words(r.dossierComplete, r.dossierSections),
								[],
								path,
								true,
							),
						),
				},
			},
			{
				id: "change-request",
				label: r.changeRequest,
				form: (done, close) => <ChangeRequestForm done={done} close={close} />,
			},
		],
		workDone: [
			{
				id: "work-done",
				label: r.workDone,
				form: (done, close) => (
					<WorkDoneForm done={done} close={close} pick={() => saveAs("work-done", "xlsx")} />
				),
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
	return (
		<ExportMenu
			items={[...extra, ...items[page]]}
			disabled={disabled || (page === "plan" && !slug)}
		/>
	);
}
