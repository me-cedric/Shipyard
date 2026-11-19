import { useState } from "react";
import { SavedActions } from "@/features/reports/export-menu";
import { PageExport } from "@/features/reports/page-export";
import { format, useI18n } from "@/lib/i18n";
import { saveAs } from "@/lib/ipc";
import { DOC_DIR, useDocList } from "@/lib/knowledge";
import { useDocxList } from "@/lib/knowledge/documents";
import { revealPath } from "@/lib/menus";
import { useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { DocumentTextIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { DocSearch, DocxView, useDocActions, useDocumentExports } from "./documents-parts";
import { ListTab } from "./list-tab";
import { CardHeader, PageCard } from "./pages";

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
		openRef(`doc:${path}`, true);
	};
	const canEdit = !useRights().gate("knowledge.edit").reason;
	const [note, setNote] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	// The file of the last export: the session list allows "Show in folder" and "Open" on it.
	const [saved, setSaved] = useState<string | null>(null);

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
	const exports = useDocumentExports().map((x) => ({ ...x, go: run(x.id, x.ext, x.job) }));
	return (
		<ListTab
			title={k.title}
			icon={<DocumentTextIcon size={16} />}
			noun={k.newDocument}
			nameLabel={k.name}
			find={k.find}
			base={DOC_DIR.documents}
			rows={rows}
			template={(name) => `# ${name}\n`}
			pills={(row) => <Badge>{k.format[row.path.endsWith(".docx") ? "docx" : "md"]}</Badge>}
			// The documents that Shipyard writes are cards of Reports: here they are in "More".
			menu={
				canEdit
					? exports.map((x) => ({
							label: `${k.export} ${x.label}`,
							disabled: exporting !== null,
							onClick: () => void x.go(),
						}))
					: []
			}
			notice={
				note ? (
					<div className="flex flex-wrap items-center gap-2">
						<p role="status" className="text-n-11">
							{note}
						</p>
						{saved ? <SavedActions path={saved} onError={setFailure} /> : null}
						<ErrorNotice error={failure} />
					</div>
				) : (
					<ErrorNotice error={failure} />
				)
			}
			side={() => (
				<Card pad className="flex flex-col items-start gap-3">
					<div className="w-full">
						<DocSearch onPick={pick} />
					</div>
					<PageExport page="documents" />
				</Card>
			)}
			below={(row) => (
				<Card className="py-2">
					<Row>
						<span className="text-n-10">{k.file}</span>
						<span className="ml-auto min-w-0 break-all font-mono text-14">{row.path}</span>
						<Button className="min-h-control" onClick={() => revealPath(row.path)}>
							{t.ui.item.reveal}
						</Button>
					</Row>
				</Card>
			)}
		>
			{(row) => <Document path={row.path} title={row.title} onRenamed={pick} />}
		</ListTab>
	);
}

/** The open document: a Markdown file in the page card, or a Word file as text, read only. */
function Document({
	path,
	title,
	onRenamed,
}: {
	path: string;
	title: string;
	onRenamed: (path: string) => void;
}) {
	const actions = useDocActions(path, onRenamed);
	return (
		<>
			{path.endsWith(".docx") ? (
				<>
					<CardHeader title={title} more={actions.items} />
					<DocxView path={path} title={title} />
				</>
			) : (
				<PageCard path={path} title={title} more={actions.items} />
			)}
			{actions.dialog}
		</>
	);
}
