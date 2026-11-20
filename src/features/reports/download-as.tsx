import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { slug } from "@/lib/knowledge";
import { Button } from "@/ui/atoms/button";
import { Row } from "@/ui/molecules/row";
import { type ExportItem, useExportRun } from "./export-menu";
import { usePdfAvailable } from "./pdf";

/**
 * The row of one document: Download as Word and as PDF (`spec:library-functions#REQ-006`). A Word
 * file stays Word and has no PDF form here. The PDF works on macOS first.
 */
export function DownloadAs({ path, title }: { path: string; title: string }) {
	const { t } = useI18n();
	const f = t.library.fn.reports;
	const pdf = usePdfAvailable();
	const { pick, status } = useExportRun();
	const item: ExportItem = {
		id: "download",
		label: title,
		quiet: true,
		save: {
			name: slug(title) || "document",
			ext: "docx",
			job: (dest) => unwrap(commands.docDownload(path, dest, true)),
		},
	};
	return (
		<>
			<Row>
				<span className="text-n-10">{f.download}</span>
				<span className="ml-auto flex flex-wrap gap-2">
					<Button className="min-h-control" onClick={() => void pick(item, "docx")}>
						{f.word}
					</Button>
					<Button
						className="min-h-control"
						disabled={!pdf || path.endsWith(".docx")}
						reason={pdf ? undefined : f.pdfOff}
						onClick={() => void pick(item, "pdf")}
					>
						{f.pdf}
					</Button>
				</span>
			</Row>
			<div className="flex flex-wrap items-center gap-2 px-6 empty:hidden">{status}</div>
		</>
	);
}
