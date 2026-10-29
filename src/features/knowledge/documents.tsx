import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ExportText, saveWorkbook, unwrap } from "@/lib/ipc";
import { DOC_DIR, message, saveDocx, useDocList } from "@/lib/knowledge";
import { Button } from "@/ui/atoms/button";
import { ArrowDownTrayIcon } from "@/ui/icons";
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
			go: run("dossier", "docx", async (path) =>
				unwrap(commands.exportDossierFile(words(k.dossier, k.text.dossier), [], path)),
			),
		},
		{
			id: "functional",
			label: k.functional,
			go: run("functional", "docx", async (path) =>
				unwrap(commands.exportFunctionalFile(words(k.functional, k.text.functional), path)),
			),
		},
		{
			id: "sheet",
			label: k.sheet,
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
			noun={k.newDocument}
			nameLabel={k.name}
			base={DOC_DIR.documents}
			rows={rows}
			template={(name) => `# ${name}\n`}
			toolbar={exports.map((x) => (
				<Button key={x.id} onClick={() => void x.go()}>
					<ArrowDownTrayIcon size={14} />
					{x.label}
				</Button>
			))}
			notice={
				note ? (
					<p
						role={note.ok ? "status" : "alert"}
						className={`px-3 py-1 text-ui ${note.ok ? "text-n-11" : "text-danger-text"}`}
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
