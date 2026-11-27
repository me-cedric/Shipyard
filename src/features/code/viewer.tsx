import { useState } from "react";
import { useBlame } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { CodeLine } from "@/ui/molecules/code-editor";
import { parseDiff } from "@/ui/molecules/diff-view";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Dialog } from "@/ui/organisms/dialog";
import { FileViewer } from "@/ui/organisms/file-viewer";
import { OpenInEditor } from "./open-in-editor";
import { useFile } from "./use-file";

/** A read-only file at a line, in a dialog. It opens from a pull request file, a finding or a ref. */
export function FileDialog({
	path,
	line = null,
	rev = null,
	onClose,
}: {
	path: string;
	line?: number | null;
	rev?: string | null;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const file = useFile(path, rev);
	const [blaming, setBlaming] = useState(false);
	const blame = useBlame(path, blaming);
	const title = line ? `${path} · ${format(t.forge.viewer.line, { n: line })}` : path;
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()} title={title} wide>
			<ErrorNotice error={file.error} />
			{file.data ? (
				<FileViewer
					label={format(t.forge.viewer.label, { path })}
					text={file.data.text}
					line={line}
					path={path}
					binary={file.data.binary}
					binaryLabel={format(t.forge.viewer.binary, { size: file.data.size })}
				/>
			) : null}
			{rev === null ? (
				<div className="flex flex-wrap items-center gap-2 pt-2">
					<Button variant="ghost" aria-pressed={blaming} onClick={() => setBlaming(!blaming)}>
						{t.forge.viewer.blame}
					</Button>
					<OpenInEditor path={path} line={line} />
				</div>
			) : null}
			<ErrorNotice error={blame.error} />
			{blaming && blame.data ? (
				<ol aria-label={t.forge.viewer.blame} className="max-h-48 overflow-auto font-mono text-12">
					{blame.data.map((b) => (
						<li key={b.line} className="flex gap-3">
							<span className="w-8 text-right text-n-10">{b.line}</span>
							<span className="w-16 text-n-11">{b.sha.slice(0, 7)}</span>
							<span>{b.author}</span>
						</li>
					))}
				</ol>
			) : null}
		</Dialog>
	);
}

/** The lines that a diff adds and removes. */
export function diffCounts(text: string) {
	const lines = parseDiff(text);
	return {
		added: lines.filter((l) => l.kind === "add").length,
		removed: lines.filter((l) => l.kind === "del").length,
	};
}

/**
 * The diff of a local change as plain numbered lines: one number column, an added line in green, a
 * removed line in red. The hunk headers do not show.
 */
export function PlainDiff({
	text,
	path,
	label,
	binary,
	truncated,
	binaryLabel,
	truncatedLabel,
}: {
	text: string;
	path: string;
	label: string;
	binary?: boolean;
	truncated?: boolean;
	binaryLabel: string;
	truncatedLabel: string;
}) {
	return (
		<section aria-label={label} className="overflow-x-auto py-3.5 font-mono text-14 leading-[1.7]">
			{binary ? <p className="px-6 text-n-11">{binaryLabel}</p> : null}
			{parseDiff(text).map((l, i) =>
				l.kind === "hunk" ? null : (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: the lines of a diff never reorder
						key={i}
						data-kind={l.kind}
						className={cn(
							"flex px-6 whitespace-pre",
							l.kind === "add"
								? "bg-success-subtle text-success-text"
								: l.kind === "del"
									? "bg-danger-subtle text-danger-text"
									: "text-n-11",
						)}
					>
						<span aria-hidden="true" className="w-8 shrink-0 tabular-nums select-none">
							{l.new ?? l.old}
						</span>
						<span className="sr-only">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</span>
						<span>
							<CodeLine text={l.text} lang={path} />
						</span>
					</div>
				),
			)}
			{truncated ? <p className="px-6 text-n-11">{truncatedLabel}</p> : null}
		</section>
	);
}
