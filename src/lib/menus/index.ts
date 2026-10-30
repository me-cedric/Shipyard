import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import type { MenuItem } from "@/ui/molecules/context-menu";

export type MenuAction =
	| "open"
	| "switch"
	| "copy-ref"
	| "copy-path"
	| "copy-sha"
	| "stage"
	| "unstage"
	| "discard"
	| "test"
	| "edit"
	| "remove";

export type EntityKind =
	| "ref"
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
	ref: ["open", "copy-ref"],
	file: ["stage", "unstage", "discard", "copy-path"],
	commit: ["open", "copy-sha"],
	connection: ["test", "edit", "remove", "copy-ref"],
	ticket: ["open", "copy-ref"],
	run: ["open", "copy-ref"],
	pull: ["open", "copy-ref"],
	branch: ["switch", "copy-ref"],
	adr: ["open", "copy-ref", "copy-path"],
	spec: ["open", "copy-ref", "copy-path"],
};

export const copyText = (text: string) => void navigator.clipboard?.writeText(text);

export type Handlers = Partial<Record<MenuAction, () => void>>;

/** `menu(kind, handlers)` gives the items of the context menu of a row. */
export function useMenus() {
	const { t } = useI18n();
	return useMemo(() => {
		const label: Record<MenuAction, string> = {
			open: t.context.open,
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
		};
		return (kind: EntityKind, handlers: Handlers): MenuItem[] =>
			MENU[kind].flatMap((id) => {
				const onSelect = handlers[id];
				return onSelect ? [{ id, label: label[id], onSelect }] : [];
			});
	}, [t]);
}
