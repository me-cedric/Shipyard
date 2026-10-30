import { type ReactNode, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useFile, useSpecsActions } from "@/lib/specs";
import { CodeEditor, type Token } from "@/ui/molecules/code-editor";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { DocForm } from "@/ui/organisms/doc-form";
import { sections } from "@/ui/organisms/doc-parts";
import { EditorFrame } from "@/ui/organisms/editor-frame";
import { type EditorError, errorLine } from "@/ui/organisms/error-line";
import { useGuard } from "./guard";

/** The status values of a spec. The value in the file is always offered too. */
const SPEC_STATUSES = ["Draft", "Review", "Approved"];

/**
 * One file in the `EditorFrame`. A save sends the stamp that the person opened. When the file
 * changed on disk, nothing is written and the person reloads or keeps the own text (REQ-023).
 * A `missing` file starts empty and its first save creates it. With `form`, a markdown file opens
 * in a form; the text view is the other choice, and both edit the same text.
 */
export function FileEditor({
	path,
	title,
	refId,
	missing,
	actions,
	problem,
	line,
	highlight,
	form,
	children,
}: {
	path: string;
	title: string;
	refId: string;
	missing?: boolean;
	actions?: ReactNode;
	/** A finding that the file holds, shown in the frame. */
	problem?: EditorError | null;
	/** The line to mark, when the person picked one. */
	line?: number | null;
	highlight?: (line: string) => Token[];
	/** Open in the section form, with the text view as the other choice. */
	form?: boolean;
	children?: ReactNode;
}) {
	const { t } = useI18n();
	const file = useFile(missing ? null : path);
	const act = useSpecsActions();
	const { error, run } = useGuard();
	const [draft, setDraft] = useState<string | null>(null);
	const [disk, setDisk] = useState<string | null>(null);
	// The stamp when the edit started: a later read must not replace it.
	const [opened, setOpened] = useState<string | null>(null);
	const [view, setView] = useState<"form" | "text">(form ? "form" : "text");
	// A picked line shows in the text view: the form has no line numbers.
	const [seen, setSeen] = useState(line);
	if (line !== seen) {
		setSeen(line);
		if (line) setView("text");
	}
	const base = missing ? "" : file.data?.text;
	const failed = file.error instanceof Error ? file.error.message : null;
	const shown = error ?? failed;
	const text = draft ?? base ?? "";
	const dirty = draft !== null && draft !== base;

	// A file with no section, such as a new one, has nothing to show in the form.
	const formed = !!form && sections(text).length > 0;
	const edit = (v: string) => {
		if (draft === null) setOpened(file.data?.stamp ?? null);
		setDraft(v);
	};

	const save = (stamp: string | null) =>
		run(async () => {
			const w = await act.write(path, text, stamp, !!missing);
			if (w.conflict) return setDisk(w.stamp ?? "");
			setDraft(null);
			setDisk(null);
		});

	return (
		<EditorFrame
			title={title}
			refId={refId}
			actions={
				formed ? (
					<>
						<ViewTabs
							label={t.editing.view.label}
							value={view}
							onValueChange={setView}
							tabs={[
								{ value: "form", label: t.editing.view.form },
								{ value: "text", label: t.editing.view.text },
							]}
						/>
						{actions}
					</>
				) : (
					actions
				)
			}
			primary={{
				label: t.specs.save,
				onClick: () => void save(opened ?? file.data?.stamp ?? null),
				disabled: !dirty || (base === undefined && !missing),
			}}
			save={disk !== null ? "conflict" : dirty ? "dirty" : "clean"}
			error={shown ? { message: shown, line: errorLine(shown) } : (problem ?? null)}
			onReload={() => {
				setDraft(null);
				setDisk(null);
				void file.refetch();
			}}
			onKeepMine={() => void save(disk)}
			labels={t.specs.editor}
		>
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
				{formed && view === "form" ? (
					<DocForm
						text={text}
						onChange={edit}
						statuses={SPEC_STATUSES}
						readOnly={base === undefined && !missing}
						labels={{ ...t.editing.field, form: title }}
					/>
				) : (
					<CodeEditor
						label={title}
						value={text}
						onChange={edit}
						errorLine={line ?? problem?.line}
						readOnly={base === undefined && !missing}
						highlight={highlight}
						className="flex-1"
					/>
				)}
				{children}
			</div>
		</EditorFrame>
	);
}
