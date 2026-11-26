import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DownloadAs } from "@/features/reports/download-as";
import { SavedActions } from "@/features/reports/export-menu";
import { PageExport } from "@/features/reports/page-export";
import { format, useI18n } from "@/lib/i18n";
import { commands, pickAnyFile, saveAs, unwrap } from "@/lib/ipc";
import { DOC_DIR, useDocList } from "@/lib/knowledge";
import { useDocxList } from "@/lib/knowledge/documents";
import { openDefault, revealPath } from "@/lib/menus";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { DocumentTextIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { DocSearch, DocxView, useDocumentExports } from "./documents-parts";
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
	const { openRef, ask } = useShell();
	const [searching, setSearching] = useState(false);
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
	const qc = useQueryClient();
	// Add a file: any file, copied into the folder as it is (`spec:library-functions#REQ-003`).
	const addFile = async () => {
		try {
			const source = await pickAnyFile();
			if (!source) return;
			const added = await unwrap(commands.docAddFile(source, true));
			await qc.invalidateQueries({ queryKey: ["knowledge"] });
			setFailure(null);
			pick(added.path);
		} catch (e) {
			setFailure(e);
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
			pills={(row) => <Badge>{kindOf(row.path, k.format)}</Badge>}
			extra={
				<RightButton
					right="knowledge.edit"
					className="min-h-control"
					onClick={() => void addFile()}
				>
					{t.library.fn.documents.addFile}
				</RightButton>
			}
			// The documents that Shipyard writes are cards of Reports: here they are in "More".
			menu={[
				{ label: t.review.documents.search, onClick: () => setSearching(true) },
				...(canEdit
					? exports.map((x) => ({
							label: `${k.export} ${x.label}`,
							disabled: exporting !== null,
							onClick: () => void x.go(),
						}))
					: []),
			]}
			notice={
				searching ? (
					<Card pad className="flex flex-wrap items-start gap-3">
						<div className="min-w-60 flex-1">
							<DocSearch onPick={pick} />
						</div>
						<Button className="min-h-control" onClick={() => setSearching(false)}>
							{t.common.close}
						</Button>
					</Card>
				) : note ? (
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
			below={(row) => (
				<>
					<Card pad className="flex flex-wrap items-center gap-3">
						<span aria-hidden="true">
							<Avatar agent name="P" />
						</span>
						<h2 className="min-w-50 flex-1 text-17 font-semibold">{k.planner}</h2>
						<Button
							className="min-h-control"
							onClick={() => ask(format(k.toSlidesAsk, { path: row.path }))}
						>
							{k.toSlides}
						</Button>
						<Button
							variant="primary"
							className="min-h-control"
							onClick={() => ask(format(k.toSpecAsk, { path: row.path }))}
						>
							{k.toSpec}
						</Button>
					</Card>
					<Card className="py-2">
						<Row>
							<span className="text-n-10">{k.file}</span>
							<span className="ml-auto min-w-0 break-all font-mono text-14">{row.path}</span>
							<Button className="min-h-control" onClick={() => revealPath(row.path)}>
								{t.ui.item.reveal}
							</Button>
						</Row>
						<Row>
							<span className="text-n-10">{k.export}</span>
							<span className="ml-auto">
								<PageExport page="documents" />
							</span>
						</Row>
						<DownloadAs path={row.path} title={row.title} />
					</Card>
				</>
			)}
		>
			{(row) => <Document path={row.path} title={row.title} />}
		</ListTab>
	);
}

/** The pill of a file: Markdown, Word, or the extension in capitals. */
const kindOf = (path: string, names: { md: string; docx: string }) =>
	path.endsWith(".docx")
		? names.docx
		: path.endsWith(".md")
			? names.md
			: (path.split(".").pop() ?? "").toUpperCase();

/** The open document: a Markdown file in the page card, or a Word file as text, read only. */
function Document({ path, title }: { path: string; title: string }) {
	const { t } = useI18n();
	return (
		<>
			{path.endsWith(".docx") ? (
				<>
					<CardHeader title={title} />
					<DocxView path={path} title={title} />
				</>
			) : !path.endsWith(".md") ? (
				// A file that Shipyard cannot show: it opens in the app of the system.
				<section aria-label={title} className="flex flex-col gap-4.5">
					<CardHeader title={title}>
						<Button className="min-h-control" onClick={() => openDefault(path)}>
							{t.library.fn.documents.open}
						</Button>
					</CardHeader>
				</section>
			) : (
				<PageCard path={path} title={title} />
			)}
		</>
	);
}
