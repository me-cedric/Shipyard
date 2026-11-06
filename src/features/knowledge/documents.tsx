import { useState } from "react";
import { SavedActions } from "@/features/reports/export-menu";
import { renderViews } from "@/features/reports/export-views";
import { PageExport } from "@/features/reports/page-export";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ExportText, saveAs, unwrap } from "@/lib/ipc";
import { DOC_DIR, useDocList } from "@/lib/knowledge";
import { useDocxList } from "@/lib/knowledge/documents";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { ArrowDownTrayIcon, DocumentTextIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
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
	// The file of the last export: the session list allows "Show in folder" and "Open" on it.
	const [saved, setSaved] = useState<string | null>(null);

	const words = (title: string, sections: string[]): ExportText => ({
		title,
		empty: k.text.empty,
		gap: k.text.gap,
		generated: k.text.generated,
		contents: k.text.contents,
		sections,
	});
	// The export in progress: a second click waits for it.
	const [exporting, setExporting] = useState<string | null>(null);
	const run =
		(name: string, ext: "docx" | "xlsx", job: (path: string) => Promise<unknown>) => async () => {
			try {
				const path = await saveAs(name, ext);
				if (!path) return;
				setExporting(name);
				await job(path);
				setFailure(null);
				setNote(format(k.exported, { path }));
				setSaved(path);
			} catch (e) {
				setNote(null);
				setSaved(null);
				setFailure(e);
			} finally {
				setExporting(null);
			}
		};
	const exports = [
		{
			id: "dossier",
			label: k.dossier,
			ext: "DOCX",
			tone: "accent" as const,
			go: run("dossier", "docx", async (path) =>
				unwrap(
					commands.exportDossierFile(words(k.dossier, k.text.dossier), await renderViews(), path),
				),
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
			id: "quality",
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
					<div className="flex flex-wrap gap-2">
						{exports.map((x) => (
							<RightButton
								right="knowledge.edit"
								key={x.id}
								title={x.ext}
								aria-label={`${k.export} ${x.label}`}
								busy={exporting === x.id}
								disabled={exporting !== null}
								onClick={() => void x.go()}
							>
								<ArrowDownTrayIcon size={14} />
								{x.label}
							</RightButton>
						))}
					</div>
				</div>
			}
			notice={
				note ? (
					<div className="flex flex-wrap items-center gap-2 px-4 pb-2">
						<p role="status" className="text-ui text-n-11">
							{note}
						</p>
						{saved ? <SavedActions path={saved} onError={setFailure} /> : null}
						<ErrorNotice error={failure} />
					</div>
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
