import { useState } from "react";
import { renderViews } from "@/features/reports/export-views";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ExportText, unwrap } from "@/lib/ipc";
import { useDocSearch, useDocx } from "@/lib/knowledge/documents";
import { Input } from "@/ui/atoms/input";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/**
 * The three documents that Shipyard writes from the project: the name of the file, its format and
 * the job that writes it. Documents and Library / Reports show them.
 */
export function useDocumentExports(): {
	id: string;
	label: string;
	ext: "docx" | "xlsx";
	job: (path: string) => Promise<unknown>;
}[] {
	const k = useI18n().t.knowledge.documents;
	const words = (title: string, sections: string[]): ExportText => ({
		title,
		empty: k.text.empty,
		gap: k.text.gap,
		generated: k.text.generated,
		contents: k.text.contents,
		sections,
	});
	return [
		{
			id: "dossier",
			label: k.dossier,
			ext: "docx",
			job: async (path) =>
				unwrap(
					commands.exportDossierFile(words(k.dossier, k.text.dossier), await renderViews(), path),
				),
		},
		{
			id: "functional",
			label: k.functional,
			ext: "docx",
			job: (path) =>
				unwrap(commands.exportFunctionalFile(words(k.functional, k.text.functional), path)),
		},
		{
			id: "quality",
			label: k.sheet,
			ext: "xlsx",
			job: async (path) => {
				// The sheet is the quality tile: the numbers that the project already holds.
				const tile = await unwrap(commands.dashboardTile("quality"));
				await unwrap(
					commands.exportSheetFile(
						words(k.sheet, []),
						[{ name: k.sheet, headers: tile.columns, rows: tile.rows }],
						path,
					),
				);
			},
		},
	];
}

/** Search in the text of the documents. A hit opens its document. */
export function DocSearch({ onPick }: { onPick: (path: string) => void }) {
	const { t } = useI18n();
	const d = t.review.documents;
	const [query, setQuery] = useState("");
	const hits = useDocSearch(query);
	const shown = query.trim() ? hits.data : undefined;
	return (
		<div className="flex flex-col gap-1">
			<Input
				label={d.search}
				type="search"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>
			{shown?.length === 0 ? (
				<p role="status" className="text-ui text-n-11">
					{d.noResults}
				</p>
			) : null}
			{shown?.length ? (
				<ul aria-label={d.results} className="flex flex-col">
					{shown.map((h) => (
						<li key={h.path}>
							<button
								type="button"
								data-nav=""
								onClick={() => onPick(h.path)}
								className="flex min-h-control w-full items-center gap-2 rounded-md px-2 text-left text-ui hover:bg-n-3"
							>
								<span className="shrink-0 text-n-12">{h.title}</span>
								<span className="min-w-0 flex-1 truncate text-12 text-n-11">{h.snippet}</span>
								<span className="shrink-0 font-mono text-12 text-n-10">
									{format(d.line, { line: h.line })}
								</span>
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

/** A `.docx` file as text, read only: the headings and the paragraphs. */
export function DocxView({ path, title }: { path: string; title: string }) {
	const doc = useDocx(path);
	return (
		<article aria-label={title} className="flex flex-col gap-2">
			<ErrorNotice error={doc.error} />
			{(doc.data ?? []).map((p, i) => {
				const key = `${i}:${p.text}`;
				// Level 1 is the title of the page: the document starts at level 2.
				if (p.heading > 0) {
					const Heading = `h${Math.min(p.heading + 1, 6)}` as "h2";
					return (
						<Heading key={key} className="text-17 font-semibold text-n-12">
							{p.text}
						</Heading>
					);
				}
				return (
					<p
						key={key}
						className="max-w-[70ch] whitespace-pre-wrap text-17 leading-relaxed text-n-12"
					>
						{p.text}
					</p>
				);
			})}
		</article>
	);
}
