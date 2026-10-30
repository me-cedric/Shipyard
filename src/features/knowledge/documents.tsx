import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ExportText, saveWorkbook, unwrap } from "@/lib/ipc";
import { DOC_DIR, message, saveDocx, useDocList } from "@/lib/knowledge";
import { Button } from "@/ui/atoms/button";
import { ArrowDownTrayIcon, DocumentTextIcon } from "@/ui/icons";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { ListTab } from "./list-tab";
import { PageEditor } from "./pages";

/**
 * Knowledge / Documents: the Markdown documents and the exports. An export is a projection that
 * the Rust store builds on demand and never reads back (REQ-012 to REQ-016).
 */
export function Documents() {
	const { t } = useI18n();
	const k = t.knowledge.documents;
	const rows = useDocList().data?.documents;
	const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

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
				setNote({ ok: true, text: format(k.exported, { path }) });
			} catch (e) {
				setNote({ ok: false, text: message(e) });
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
					className="lg:grid-cols-3"
				/>
			}
			notice={
				note ? (
					<p
						role={note.ok ? "status" : "alert"}
						className={`px-4 pb-2 text-ui ${note.ok ? "text-n-11" : "text-danger-text"}`}
					>
						{note.text}
					</p>
				) : null
			}
		>
			{(row) => <PageEditor path={row.path} title={row.title} />}
		</ListTab>
	);
}
