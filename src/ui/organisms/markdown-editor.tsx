import type { ReactNode } from "react";
import { CodeEditor } from "../molecules/code-editor";
import { EditorFrame, type SaveState } from "./editor-frame";
import { MarkdownView } from "./markdown-view";

type Labels = Parameters<typeof EditorFrame>[0]["labels"] & { text: string; preview: string };

/**
 * The one Markdown editor of Handbook and Documents: the text on the left, the preview on the
 * right. A ref in the text shows as a RefChip in the preview (knowledge REQ-011).
 */
export function MarkdownEditor({
	title,
	refId,
	value,
	onChange,
	save,
	onSave,
	canSave,
	error,
	onReload,
	onKeepMine,
	actions,
	labels,
	saveLabel,
}: {
	title: string;
	refId: string;
	value: string;
	onChange: (value: string) => void;
	save: SaveState;
	onSave: () => void;
	canSave: boolean;
	error?: string | null;
	onReload: () => void;
	onKeepMine: () => void;
	actions?: ReactNode;
	labels: Labels;
	saveLabel: string;
}) {
	return (
		<EditorFrame
			title={title}
			refId={refId}
			actions={actions}
			primary={{ label: saveLabel, onClick: onSave, disabled: !canSave }}
			save={save}
			error={error ? { message: error } : null}
			onReload={onReload}
			onKeepMine={onKeepMine}
			labels={labels}
		>
			<div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-1 gap-3">
				<CodeEditor label={labels.text} value={value} onChange={onChange} />
				<div className="min-h-0 overflow-auto">
					<MarkdownView source={value} label={labels.preview} />
				</div>
			</div>
		</EditorFrame>
	);
}
