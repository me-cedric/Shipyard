import { useState } from "react";
import { useBlame } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
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
			{file.error ? (
				<p role="alert" className="text-ui text-danger-text">
					{file.error.message}
				</p>
			) : null}
			{file.data ? (
				<FileViewer
					label={format(t.forge.viewer.label, { path })}
					text={file.data.text}
					line={line}
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
			{blame.error ? (
				<p role="alert" className="text-ui text-danger-text">
					{String(blame.error)}
				</p>
			) : null}
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
