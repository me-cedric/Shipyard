import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type FileAction, FileActionDialog } from "@/features/code/file-actions";
import { format, useI18n } from "@/lib/i18n";
import { useDocSearch, useDocx } from "@/lib/knowledge/documents";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { PencilIcon, TrashIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";

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
								className="flex min-h-row w-full items-center gap-2 rounded-md px-2 text-left text-ui hover:bg-n-3"
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

/**
 * Rename and delete of one document. A delete asks first and moves the file to the trash. The
 * lists read their data again after each one.
 */
export function DocActions({
	path,
	title,
	onRenamed,
}: {
	path: string;
	title: string;
	onRenamed: (path: string) => void;
}) {
	const { t } = useI18n();
	const d = t.review.documents;
	const qc = useQueryClient();
	const [action, setAction] = useState<FileAction | null>(null);
	return (
		<>
			<Button
				variant="ghost"
				aria-label={`${d.rename} ${title}`}
				onClick={() => setAction({ kind: "rename", path })}
			>
				<PencilIcon size={14} />
				{d.rename}
			</Button>
			<Button
				variant="ghost"
				aria-label={`${d.delete} ${title}`}
				onClick={() => setAction({ kind: "delete", path })}
			>
				<TrashIcon size={14} />
				{d.delete}
			</Button>
			{action ? (
				<FileActionDialog
					action={action}
					onClose={() => setAction(null)}
					onDone={(done, target) => {
						void qc.invalidateQueries({ queryKey: ["knowledge"] });
						void qc.invalidateQueries({ queryKey: ["refs"] });
						setAction(null);
						if (done.kind === "rename") onRenamed(target);
					}}
				/>
			) : null}
		</>
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
						<Heading key={key} className="text-14 font-medium text-n-12">
							{p.text}
						</Heading>
					);
				}
				return (
					<p key={key} className="whitespace-pre-wrap text-ui text-n-12">
						{p.text}
					</p>
				);
			})}
		</article>
	);
}
