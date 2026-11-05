import type { ReactNode } from "react";
import { DESIGN_DIR, ofKind, slug, useDesignActions, useDesignList } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { EditorPreview } from "@/ui/molecules/pane-toggle";
import { dbml, likec4 } from "@/ui/molecules/syntax";
import type { EditorError } from "@/ui/organisms/error-line";
import { FileFrame } from "./frame";
import { ArtifactTab } from "./tab";

/**
 * A tab of text files with a live view beside the text: LikeC4 models and DBML models.
 * The view keeps its last good render and reports its error with the line (REQ-006, REQ-007,
 * REQ-014, REQ-015).
 */
export function TextTab({
	kind,
	title,
	icon,
	noun,
	ext,
	template,
	textLabel,
	view,
}: {
	kind: "model" | "data";
	title: string;
	icon: ReactNode;
	noun: string;
	ext: string;
	template: string;
	textLabel: string;
	view: (source: string, onError: (e: EditorError | null) => void) => ReactNode;
}) {
	const { t } = useI18n();
	const list = useDesignList().data;
	const act = useDesignActions();
	const rows = ofKind(list, kind);
	return (
		<ArtifactTab
			title={title}
			icon={icon}
			noun={noun}
			rows={rows.map((a) => ({ ref: a.reference, title: a.title, issue: a.issue, path: a.path }))}
			create={{
				run: async (name) => {
					const s = slug(name);
					await act.create(`${DESIGN_DIR[kind]}/${s}.${ext}`, template);
					return `${kind}:${s}`;
				},
			}}
		>
			{(row) => {
				const a = rows.find((x) => x.reference === row.ref);
				return a ? (
					<FileFrame path={a.path} refId={a.reference} title={a.title} issue={a.issue}>
						{(file, onError, error) => (
							<EditorPreview
								id="design-text-width"
								label={t.design.resize.editor}
								editor={
									<CodeEditor
										label={textLabel}
										value={file.text}
										errorLine={error?.line}
										onChange={file.setText}
										highlight={kind === "model" ? likec4 : dbml}
									/>
								}
								preview={
									<div className="min-h-0 min-w-0 flex-1 overflow-auto">
										{view(file.text, onError)}
									</div>
								}
							/>
						)}
					</FileFrame>
				) : null;
			}}
		</ArtifactTab>
	);
}
