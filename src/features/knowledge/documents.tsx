import { useState } from "react";
import { PageExport } from "@/features/reports/page-export";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ExportText, saveWorkbook, unwrap } from "@/lib/ipc";
import { DOC_DIR, saveDocx, useDocList } from "@/lib/knowledge";
import { useDocxList } from "@/lib/knowledge/documents";
import { useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { Button } from "@/ui/atoms/button";
import { ArrowDownTrayIcon, DocumentTextIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { DocActions, DocSearch, DocxView } from "./documents-parts";
import { ListTab } from "./list-tab";
import { PageEditor } from "./pages";

/**
 * Knowledge / Documents: the Markdown documents and the exports. An export is a projection that
 * the Rust store builds on demand and never reads back (REQ-012 to REQ-016).
 */
export function Documents() {
	const { t } = useI18n();
	const k = t.knowledge.documents;
	const pages = useDocList().data?.documents;
	const docx = useDocxList().data ?? [];
	// The Word files sit in the same list, after the pages of their folder, in path order.
	const rows = pages && [...pages, ...docx].sort((a, b) => a.path.localeCompare(b.path));
	const { openRef } = useShell();
	const [, select] = useTabSelection(`knowledge:${DOC_DIR.documents}`);
	const pick = (path: string) => {
		select(path);
		openRef(`doc:${path}`);
	};
	const [note, setNote] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);

	const words = (title: string, sections: string[]): ExportText => ({
		title,
		empty: k.text.empty,
		gap: k.text.gap,
		generated: k.text.generated,
		sections,
	});
	const run =
		(name: string, ext: "docx" | "xlsx", job: (path: string) => Promise<unknown>) => async () => {
			try {
				const path = await (ext === "docx" ? saveDocx(name) : saveWorkbook(name));
				if (!path) return;
				await job(path);
				setFailure(null);
				setNote(format(k.exported, { path }));
			} catch (e) {
				setNote(null);
				setFailure(e);
			}
		};
	const exports = [
		{
			id: "dossier",
			label: k.dossier,
			ext: "DOCX",
			tone: "accent" as const,
			go: run("dossier", "docx", async (path) =>
				unwrap(commands.exportDossierFile(words(k.dossier, k.text.dossier), [], path)),
			),
		},
		{
			id: "functional",
			label: k.functional,
			ext: "DOCX",
			tone: "info" as const,
			go: run("functional", "docx", async (path) =>
				unwrap(commands.exportFunctionalFile(words(k.functional, k.text.functional), path)),
			),
		},
		{
			id: "sheet",
			label: k.sheet,
			ext: "XLSX",
			tone: "success" as const,
			go: run("quality", "xlsx", async (path) => {
				// The sheet is the quality tile: the numbers that the project already holds.
				const tile = await unwrap(commands.dashboardTile("quality"));
				await unwrap(
					commands.exportSheetFile(
						words(k.sheet, []),
						[{ name: k.sheet, headers: tile.columns, rows: tile.rows }],
						path,
					),
				);
			}),
		},
	];
	return (
		<ListTab
			title={k.title}
			icon={<DocumentTextIcon size={16} />}
			noun={k.newDocument}
			nameLabel={k.name}
			base={DOC_DIR.documents}
			rows={rows}
			template={(name) => `# ${name}\n`}
			toolbar={
				<div className="flex flex-col items-start gap-3">
					<PageExport page="documents" />
					<div className="w-full max-w-xl">
						<DocSearch onPick={pick} />
					</div>
					<StatStrip
						items={exports.map((x) => ({
							label: x.label,
							value: x.ext,
							tone: x.tone,
							icon: <DocumentTextIcon size={12} />,
							extra: (
								<Button
									variant="ghost"
									aria-label={`${k.export} ${x.label}`}
									className="-ml-2 h-6 px-2 text-12"
									onClick={() => void x.go()}
								>
									<ArrowDownTrayIcon size={12} />
									{k.export}
								</Button>
							),
						}))}
						className="w-full lg:grid-cols-3"
					/>
				</div>
			}
			notice={
				note ? (
					<p role="status" className="px-4 pb-2 text-ui text-n-11">
						{note}
					</p>
				) : (
					<ErrorNotice error={failure} className="px-4 pb-2" />
				)
			}
		>
			{(row) => {
				const actions = <DocActions path={row.path} title={row.title} onRenamed={pick} />;
				return row.path.endsWith(".docx") ? (
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-2">
							<h2 className="min-w-0 flex-1 truncate text-14 font-medium text-n-12">{row.title}</h2>
							{actions}
						</div>
						<DocxView path={row.path} title={row.title} />
					</div>
				) : (
					<PageEditor path={row.path} title={row.title} actions={actions} />
				);
			}}
		</ListTab>
	);
}
