import { type ReactNode, useEffect, useState } from "react";
import { useDesignFile } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { RightButton, useRights } from "@/lib/rights";
import { useDraftCount } from "@/lib/shell/drafts";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { AUTOSAVE_MS } from "@/ui/organisms/editor-frame";
import type { EditorError } from "@/ui/organisms/error-line";
import { LeaveGuard } from "@/ui/organisms/leave-guard";

type File = ReturnType<typeof useDesignFile>;

export type Frame = {
	file: File;
	/** The error of the view, with its line. */
	error: EditorError | null;
	onError: (e: EditorError | null) => void;
	/** The save button with the mark of a draft, or null for a file that never saves. */
	save: ReactNode;
	/** The conflict choice and the error line. The page puts them above its body. */
	alerts: ReactNode;
};

/**
 * One design file of a page: the stamp, the conflict choice, the read error and the error of the
 * view. A file that is not readable shows its error and no editor (REQ-005). `readOnly` gives no
 * save. A draft saves itself after a short pause, unless an error shows. Leaving the page with a
 * draft asks first, and the close guard of the window counts it. The page draws the parts: this
 * frame has no header (the ref and the file name are in the "More" menu of the page).
 */
export function FileFrame({
	path,
	issue,
	missing,
	notice,
	readOnly,
	children,
}: {
	path: string;
	/** Why the list could not read the file. */
	issue?: string | null;
	missing?: string;
	/** An error of an action beside the file, such as a refused open. */
	notice?: string | null;
	readOnly?: boolean;
	children: (frame: Frame) => ReactNode;
}) {
	const { t } = useI18n();
	const f = t.design.frame;
	const { gate } = useRights();
	const file = useDesignFile(path, missing);
	const [viewError, setViewError] = useState<EditorError | null>(null);
	const message = issue ?? file.error ?? notice;
	const error = message ? { message } : viewError;
	const saves = !(readOnly || issue || !file.ready);
	const state = file.conflict ? "conflict" : file.dirty ? "dirty" : "clean";
	const blocked = !saves || !!gate("design.edit").reason;
	const save = file.save;
	useEffect(() => {
		if (state !== "dirty" || blocked || error) return;
		const id = setTimeout(() => void save(), AUTOSAVE_MS);
		return () => clearTimeout(id);
	}, [state, blocked, error, save]);
	useDraftCount(state !== "clean");
	return children({
		file,
		error,
		onError: setViewError,
		save: saves ? (
			<span className="ml-auto flex items-center gap-2">
				{state === "dirty" ? <StatusDot status="warning" label={f.dirty} /> : null}
				<RightButton
					right="design.edit"
					disabled={!file.dirty || state === "conflict"}
					onClick={() => void file.save()}
				>
					{t.design.save}
				</RightButton>
			</span>
		) : null,
		alerts: (
			<>
				<LeaveGuard
					dirty={state !== "clean"}
					file={path}
					onSave={saves && state === "dirty" ? save : undefined}
				/>
				{state === "conflict" ? (
					<div
						role="alert"
						className="flex flex-wrap items-center gap-2 rounded-md bg-warning-subtle px-4 py-2 text-warning-text"
					>
						<span className="flex-1">{f.conflict}</span>
						<Button onClick={() => void file.keepMine()}>{f.keepMine}</Button>
						<Button variant="primary" onClick={() => void file.reload()}>
							{f.reload}
						</Button>
					</div>
				) : null}
				{error ? (
					<p
						role="alert"
						className="flex gap-2 rounded-md bg-danger-subtle px-4 py-2 font-mono text-14 text-danger-text"
					>
						{error.line ? (
							<span className="shrink-0 font-medium">
								{f.line} {error.line}
							</span>
						) : null}
						<span className="min-w-0 whitespace-pre-wrap">{error.message}</span>
					</p>
				) : null}
			</>
		),
	});
}
