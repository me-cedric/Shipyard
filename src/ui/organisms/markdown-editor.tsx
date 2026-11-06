import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CodeEditor } from "../molecules/code-editor";
import { SideToggles, useSides } from "../molecules/pane-toggle";
import { markdown } from "../molecules/syntax";
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
	const { sides, toggle } = useSides(`markdown:${refId}`);
	return (
		<EditorFrame
			title={title}
			refId={refId}
			actions={
				<>
					<SideToggles sides={sides} toggle={toggle} />
					{actions}
				</>
			}
			primary={{ label: saveLabel, onClick: onSave, disabled: !canSave }}
			save={save}
			error={error ? { message: error } : null}
			onReload={onReload}
			onKeepMine={onKeepMine}
			labels={labels}
		>
			<div
				className={cn(
					"grid min-h-0 flex-1 grid-rows-1 gap-3",
					sides.editor && sides.preview ? "grid-cols-2" : "grid-cols-1",
				)}
			>
				{sides.editor ? (
					<CodeEditor label={labels.text} value={value} onChange={onChange} highlight={markdown} />
				) : null}
				{sides.preview ? (
					<div className="min-h-0 overflow-auto">
						<MarkdownView source={value} label={labels.preview} />
					</div>
				) : null}
			</div>
		</EditorFrame>
	);
}
