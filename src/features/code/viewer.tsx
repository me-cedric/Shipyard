import { format, useI18n } from "@/lib/i18n";
import { Dialog } from "@/ui/organisms/dialog";
import { FileViewer } from "@/ui/organisms/file-viewer";
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
		</Dialog>
	);
}
