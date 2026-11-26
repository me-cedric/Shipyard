import { type ReactNode, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { useViewState } from "@/lib/shell/view-state";
import { useFile, useSpecsActions } from "@/lib/specs";
import { Segmented } from "@/ui/atoms/segmented";
import { BookOpenIcon, PencilIcon } from "@/ui/icons";
import { CodeEditor, type Token } from "@/ui/molecules/code-editor";
import { RefChip } from "@/ui/molecules/ref-chip";
import { languageFor } from "@/ui/molecules/syntax";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { DocForm } from "@/ui/organisms/doc-form";
import { sections } from "@/ui/organisms/doc-parts";
import { EditorFrame } from "@/ui/organisms/editor-frame";
import { type EditorError, errorLine } from "@/ui/organisms/error-line";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { useGuard } from "./guard";

/** The status values of a spec. The value in the file is always offered too. */
const SPEC_STATUSES = ["Draft", "Review", "Approved"];

/** The parts that a page lays out itself: the Read / Text switch, the mode, the Edit action and the body. */
export type FileFrame = { modes: ReactNode; editing: boolean; edit: () => void; body: ReactNode };

/**
 * One file in the `EditorFrame`. A save sends the stamp that the person opened. When the file
 * changed on disk, nothing is written and the person reloads or keeps the own text (REQ-023).
 * A `missing` file starts empty and its first save creates it. With `form`, a markdown file opens
 * in a form; the text view is the other choice, and both edit the same text. With `read`, the file
 * opens as a page to read, and Edit switches to the editor (spec:app-redesign#REQ-021). `page`
 * draws that page for a file that is not Markdown. A file with nothing to read, a read error and
 * a picked line show the editor. With `frame`, the page draws the switch in its own header: the
 * switch is Read / Text, and the page to read has no ref chip.
 */
export function FileEditor({
	path,
	title,
	refId,
	missing,
	actions,
	problem,
	line,
	pick,
	highlight,
	form,
	view: fixed,
	read,
	page,
	frame,
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
	/** A number that changes at each pick of a line: the same line picked again shows the text again. */
	pick?: number;
	highlight?: (line: string) => Token[];
	/** Open in the section form, with the text view as the other choice. */
	form?: boolean;
	/** The page picks the view in its own switch: the editor draws none and follows this value. */
	view?: "form" | "text";
	/** Open as a page to read, with an Edit switch. */
	read?: boolean;
	/** The page to read of a file that is not Markdown. Null when the text has nothing to read. */
	page?: (text: string) => ReactNode;
	/** Lays out the switch and the body in the header and the columns of a page. */
	frame?: (parts: FileFrame) => ReactNode;
	children?: ReactNode;
}) {
	const { t } = useI18n();
	const { gate } = useRights();
	const file = useFile(missing ? null : path);
	const act = useSpecsActions();
	const { error, run } = useGuard();
	const [draft, setDraft] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [disk, setDisk] = useState<string | null>(null);
	// The stamp when the edit started: a later read must not replace it.
	const [opened, setOpened] = useState<string | null>(null);
	const [own, setView] = useState<"form" | "text">(form ? "form" : "text");
	const view = fixed ?? own;
	const [mode, setMode] = useViewState<"read" | "edit">(`mode:${path}`, read ? "read" : "edit");
	// A picked line shows in the text view: the form has no line numbers. The stored choice stays.
	const [picked, setPicked] = useState(false);
	const asked = `${line}:${pick}`;
	const [seen, setSeen] = useState<string>();
	if (asked !== seen) {
		setSeen(asked);
		if (line) {
			setView("text");
			setPicked(true);
		}
	}
	const base = missing ? "" : file.data?.text;
	const failed = file.error instanceof Error ? file.error.message : null;
	const shown = error ?? failed;
	const text = draft ?? base ?? "";
	const dirty = draft !== null && draft !== base;

	// A file with no section, such as a new one, has nothing to show in the form.
	const formed = (!!form || !!fixed) && sections(text).length > 0;
	const edit = (v: string) => {
		if (draft === null) setOpened(file.data?.stamp ?? null);
		setDraft(v);
	};

	// Text typed during a save stays: the draft clears only when it is still the saved text.
	const save = (stamp: string | null) =>
		run(async () => {
			const sent = text;
			setSaving(true);
			try {
				const w = await act.write(path, sent, stamp, !!missing);
				if (w.conflict) return setDisk(w.stamp ?? "");
				setOpened(w.stamp);
				setDraft((d) => (d === sent ? null : d));
				setDisk(null);
			} finally {
				setSaving(false);
			}
		});

	const k = t.knowledge.handbook;
	const reading = page ? page(text) : <MarkdownView source={text} label={title} reading />;
	const editing = picked || mode === "edit";
	// A text with nothing to read has no switch: Read would do nothing.
	const pickMode = (m: "read" | "edit") => {
		setPicked(false);
		setMode(m);
	};
	const modes = !(read && reading) ? null : frame ? (
		<div className="shrink-0">
			<Segmented
				label={k.mode}
				value={editing ? "edit" : "read"}
				onValueChange={pickMode}
				items={[
					{ value: "read", label: k.read },
					{ value: "edit", label: t.editing.view.text },
				]}
			/>
		</div>
	) : (
		<ViewTabs
			label={k.mode}
			value={editing ? "edit" : "read"}
			onValueChange={pickMode}
			tabs={[
				{ value: "read", label: k.read, icon: <BookOpenIcon size={12} /> },
				{ value: "edit", label: k.edit, icon: <PencilIcon size={12} /> },
			]}
		/>
	);
	const toText = () => pickMode("edit");
	if (!editing && reading && !shown) {
		if (frame)
			return frame({
				modes,
				editing: false,
				edit: toText,
				body: (
					<>
						{reading}
						{children}
					</>
				),
			});
		return (
			<div className="flex min-h-0 flex-1 flex-col gap-3">
				<div className="flex items-center gap-2">
					<RefChip refId={refId} state="resolved" />
					<span className="flex-1" />
					{modes}
				</div>
				<div className="min-h-0 flex-1 overflow-auto">
					<div className="mx-auto max-w-[680px] pb-4">{reading}</div>
				</div>
				{children}
			</div>
		);
	}
	const body = (
		<EditorFrame
			title={title}
			refId={refId}
			actions={
				formed ? (
					<>
						{frame ? null : modes}
						{fixed ? null : (
							<ViewTabs
								label={t.editing.view.label}
								value={view}
								onValueChange={setView}
								tabs={[
									{ value: "form", label: t.editing.view.form },
									{ value: "text", label: t.editing.view.text },
								]}
							/>
						)}
						{actions}
					</>
				) : (
					<>
						{frame ? null : modes}
						{actions}
					</>
				)
			}
			primary={{
				label: t.specs.save,
				onClick: () => void save(opened ?? file.data?.stamp ?? null),
				disabled: !dirty || saving || (base === undefined && !missing),
				reason: gate("specs.edit").reason,
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
						highlight={highlight ?? languageFor(path) ?? undefined}
						className="flex-1"
					/>
				)}
				{children}
			</div>
		</EditorFrame>
	);
	return frame ? frame({ modes, editing: true, edit: toText, body }) : body;
}
