import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, confirmDialog, errorDialog, toFailure, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { useShell } from "@/lib/shell";
import type { MenuItem } from "@/ui/molecules/context-menu";

export { useAsk } from "./ask";
export { useRename } from "./rename";

export type MenuAction =
	| "open"
	| "open-browser"
	| "reveal"
	| "open-default"
	| "switch"
	| "copy-ref"
	| "copy-path"
	| "copy-sha"
	| "stage"
	| "unstage"
	| "discard"
	| "test"
	| "edit"
	| "remove"
	| "rename"
	| "delete";

export type EntityKind =
	| "ref"
	| "project"
	| "file"
	| "commit"
	| "connection"
	| "ticket"
	| "run"
	| "pull"
	| "branch"
	| "adr"
	| "spec";

/**
 * The one table (spec `shell`, REQ-013): the actions that each kind of entity offers, in order.
 * A row gives a handler for each action that applies to it now. An action with no handler is left out.
 */
export const MENU: Record<EntityKind, MenuAction[]> = {
	ref: [
		"open",
		"open-browser",
		"reveal",
		"open-default",
		"copy-ref",
		"copy-path",
		"rename",
		"delete",
	],
	project: ["open", "open-browser", "reveal", "copy-path"],
	file: ["stage", "unstage", "discard", "reveal", "open-default", "copy-path"],
	commit: ["open", "copy-sha"],
	connection: ["test", "edit", "remove", "copy-ref"],
	ticket: ["open", "open-browser", "copy-ref"],
	run: ["open", "copy-ref"],
	pull: ["open", "open-browser", "copy-ref"],
	branch: ["switch", "copy-ref"],
	adr: ["open", "copy-ref", "copy-path", "rename", "delete"],
	spec: ["open", "copy-ref", "copy-path"],
};

/** Resolves when the text is on the clipboard. A failure resolves too: the copy control then shows no tick. */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export const COPIED_MS = 1500;

/** `copied` is true for 1.5 s after a copy worked. A copy control shows a tick and "Copied" then. */
export function useCopy() {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	const copy = useCallback(async (text: string) => {
		if (!(await copyText(text))) return;
		clearTimeout(timer.current);
		setCopied(true);
		timer.current = setTimeout(() => setCopied(false), COPIED_MS);
	}, []);
	return { copied, copy };
}

/** The two openers of a link and of a place on disk. A failure is logged, not shown. */
export const openUrl = (url: string) => void unwrap(commands.openLink(url)).catch(logError);
export const revealPath = (path: string) => void unwrap(commands.revealPath(path)).catch(logError);
export const openDefault = (path: string) =>
	void unwrap(commands.openDefault(path)).catch(logError);

/**
 * Delete of a project file from a menu: one confirm that names the file, then the system trash,
 * then fresh lists. The inspector closes when it showed the item. A failure shows in a dialog.
 */
export function useTrash() {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { selectedRef, closeDetail } = useShell();
	return useCallback(
		async (path: string, ref: string) => {
			if (!(await confirmDialog(format(t.ui.item.confirmTrash, { path })))) return;
			try {
				await unwrap(commands.filesDelete(path, true));
			} catch (e) {
				await errorDialog(toFailure(e).message);
				return;
			}
			// The queries of the gone file are dropped, not read again: a read would log "no such file".
			const gone = (q: { queryKey: readonly unknown[] }) => q.queryKey.includes(path);
			for (const k of ["design", "knowledge", "refs", "specs"])
				void qc.invalidateQueries({ queryKey: [k], predicate: (q) => !gone(q) });
			qc.removeQueries({ predicate: gone });
			if (selectedRef === ref) closeDetail();
		},
		[t, qc, selectedRef, closeDetail],
	);
}

export type Handlers = Partial<Record<MenuAction, () => void>>;

/** `menu(kind, handlers)` gives the items of the context menu of a row. */
export function useMenus() {
	const { t } = useI18n();
	return useMemo(() => {
		const label: Record<MenuAction, string> = {
			open: t.context.open,
			"open-browser": t.ui.item.openBrowser,
			reveal: t.ui.item.reveal,
			"open-default": t.ui.item.openDefault,
			switch: t.code.switch,
			"copy-ref": t.context.copyRef,
			"copy-path": t.context.copyPath,
			"copy-sha": t.context.copySha,
			stage: t.code.stage,
			unstage: t.code.unstage,
			discard: t.code.discard,
			test: t.connections.test,
			edit: t.connections.edit,
			remove: t.connections.remove,
			rename: t.ui.item.rename,
			delete: t.ui.item.delete,
		};
		return (kind: EntityKind, handlers: Handlers): MenuItem[] =>
			MENU[kind].flatMap((id) => {
				const onSelect = handlers[id];
				return onSelect ? [{ id, label: label[id], onSelect }] : [];
			});
	}, [t]);
}
