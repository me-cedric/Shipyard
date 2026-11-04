import { type ReactNode, useEffect } from "react";
import { copyText } from "@/lib/menus";
import { useDraftCount } from "@/lib/shell/drafts";
import { Button } from "../atoms/button";
import { IconButton } from "../atoms/icon-button";
import { StatusDot } from "../atoms/status-dot";
import { ClipboardIcon } from "../icons";
import { RefChip, type RefState } from "../molecules/ref-chip";
import type { EditorError } from "./error-line";
import { LeaveGuard } from "./leave-guard";

/** The pause after the last change, in ms, before a draft saves itself. */
export const AUTOSAVE_MS = 1500;

export type SaveState = "clean" | "dirty" | "conflict";

/**
 * The one frame of every Design and Specs artifact. The caller passes every text.
 * A conflict offers a reload or keep mine, and holds the primary action until the person chooses.
 * A draft saves itself after a short pause, unless an error shows. Leaving the page with a draft
 * that is not saved asks first, and the close guard of the window counts it.
 */
export function EditorFrame({
	title,
	refId,
	refState = "resolved",
	actions,
	primary,
	save = "clean",
	error,
	onReload,
	onKeepMine,
	labels,
	children,
}: {
	title: string;
	refId: string;
	refState?: RefState;
	/** Secondary actions, left of the primary one. */
	actions?: ReactNode;
	primary?: { label: string; onClick: () => void; disabled?: boolean };
	save?: SaveState;
	error?: EditorError | null;
	onReload?: () => void;
	onKeepMine?: () => void;
	labels: {
		copy: string;
		dirty: string;
		conflict: string;
		reload: string;
		keepMine: string;
		/** The word before a line number. */
		line: string;
	};
	children: ReactNode;
}) {
	const onSave = primary?.onClick;
	const blocked = !primary || primary.disabled;
	useEffect(() => {
		if (save !== "dirty" || blocked || error || !onSave) return;
		const id = setTimeout(onSave, AUTOSAVE_MS);
		return () => clearTimeout(id);
	}, [save, blocked, error, onSave]);
	useDraftCount(save !== "clean");
	return (
		<section aria-label={title} className="flex min-h-0 flex-1 flex-col gap-2">
			<LeaveGuard dirty={save !== "clean"} />
			<header className="flex items-center gap-2">
				<h2 className="truncate text-14 font-medium">{title}</h2>
				<RefChip refId={refId} state={refState} />
				<IconButton label={labels.copy} onClick={() => copyText(refId)}>
					<ClipboardIcon size={14} />
				</IconButton>
				{save === "dirty" ? <StatusDot status="warning" label={labels.dirty} /> : null}
				<div className="ml-auto flex items-center gap-2">
					{actions}
					{primary ? (
						<Button disabled={primary.disabled || save === "conflict"} onClick={primary.onClick}>
							{primary.label}
						</Button>
					) : null}
				</div>
			</header>
			{save === "conflict" ? (
				<div
					role="alert"
					className="flex items-center gap-2 rounded-md bg-warning-subtle px-3 py-1 text-ui text-warning-text"
				>
					<span className="flex-1">{labels.conflict}</span>
					<Button onClick={onReload}>{labels.reload}</Button>
					<Button onClick={onKeepMine}>{labels.keepMine}</Button>
				</div>
			) : null}
			<div className="flex min-h-0 flex-1 flex-col">{children}</div>
			{error ? (
				<p
					role="alert"
					className="flex gap-2 rounded-md bg-danger-subtle px-3 py-1 font-mono text-12 text-danger-text"
				>
					{error.line ? (
						<span className="shrink-0 font-medium">
							{labels.line} {error.line}
						</span>
					) : null}
					<span className="min-w-0 whitespace-pre-wrap">{error.message}</span>
				</p>
			) : null}
		</section>
	);
}
