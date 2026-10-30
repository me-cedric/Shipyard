import { type ReactNode, useState } from "react";
import { useDesignFile } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/ui/atoms/badge";
import { DocumentTextIcon } from "@/ui/icons";
import { EditorFrame } from "@/ui/organisms/editor-frame";
import type { EditorError } from "@/ui/organisms/error-line";

type File = ReturnType<typeof useDesignFile>;

/**
 * One design file in the editor frame: the stamp, the conflict choice, the read error and the
 * error of the view. A file that is not readable shows its error and no editor (REQ-005).
 * `readOnly` gives no save: draw.io and BPMN open only (Q-040).
 */
export function FileFrame({
	path,
	refId,
	title,
	issue,
	missing,
	notice,
	readOnly,
	actions,
	children,
}: {
	path: string;
	refId: string;
	title: string;
	/** Why the list could not read the file. */
	issue?: string | null;
	missing?: string;
	/** An error of an action beside the file, such as a refused open. */
	notice?: string | null;
	readOnly?: boolean;
	actions?: ReactNode;
	children: (
		file: File,
		onError: (e: EditorError | null) => void,
		viewError: EditorError | null,
	) => ReactNode;
}) {
	const { t } = useI18n();
	const file = useDesignFile(path, missing);
	const [viewError, setViewError] = useState<EditorError | null>(null);
	const message = issue ?? file.error ?? notice;
	const error = message ? { message } : viewError;
	return (
		<EditorFrame
			title={title}
			refId={refId}
			actions={
				<>
					<Badge title={path} className="max-w-44 shrink-0 font-mono">
						<DocumentTextIcon size={12} />
						<span className="truncate">{path.split("/").pop()}</span>
					</Badge>
					{actions}
				</>
			}
			primary={
				readOnly || issue || !file.ready
					? undefined
					: { label: t.design.save, onClick: () => void file.save(), disabled: !file.dirty }
			}
			save={file.conflict ? "conflict" : file.dirty ? "dirty" : "clean"}
			error={error}
			onReload={() => void file.reload()}
			onKeepMine={() => void file.keepMine()}
			labels={t.design.frame}
		>
			{file.ready && !issue ? children(file, setViewError, viewError) : null}
		</EditorFrame>
	);
}
