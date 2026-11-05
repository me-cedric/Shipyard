import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { useViewState } from "@/lib/shell/view-state";
import { cn } from "@/lib/utils";
import { IconButton } from "../atoms/icon-button";
import { BookOpenIcon, PencilIcon } from "../icons";
import { SplitPane } from "./split-pane";

type Sides = { editor: boolean; preview: boolean };

/** Which side of an editor and its preview shows, kept per view. At least one side stays visible. */
export function useSides(id: string) {
	const [sides, set] = useViewState<Sides>(`sides:${id}`, { editor: true, preview: true });
	const toggle = (side: keyof Sides) => {
		const next = { ...sides, [side]: !sides[side] };
		if (next.editor || next.preview) set(next);
	};
	return { sides, toggle };
}

/** One icon button for each side. A pressed button means that its side shows. */
export function SideToggles({
	sides,
	toggle,
}: {
	sides: Sides;
	toggle: (side: keyof Sides) => void;
}) {
	const { t } = useI18n();
	return (
		<>
			<IconButton
				label={t.editing.sides.editor}
				aria-pressed={sides.editor}
				onClick={() => toggle("editor")}
				className={cn(sides.editor && "bg-n-3 text-n-12")}
			>
				<PencilIcon size={14} />
			</IconButton>
			<IconButton
				label={t.editing.sides.preview}
				aria-pressed={sides.preview}
				onClick={() => toggle("preview")}
				className={cn(sides.preview && "bg-n-3 text-n-12")}
			>
				<BookOpenIcon size={14} />
			</IconButton>
		</>
	);
}

/**
 * An editor and its preview side by side, with a toggle for each side above them. With both sides
 * the editor sits in a resizable pane; with one side, that side takes the row. `preview` brings its
 * own wrapper (`min-w-0 flex-1`).
 */
export function EditorPreview({
	id,
	label,
	editor,
	preview,
}: {
	/** The key of the view: the toggles and the pane width are kept under it. */
	id: string;
	/** The name of the resize handle. */
	label: string;
	editor: ReactNode;
	preview: ReactNode;
}) {
	const { sides, toggle } = useSides(id);
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<div className="flex justify-end gap-1">
				<SideToggles sides={sides} toggle={toggle} />
			</div>
			<div className="flex min-h-0 flex-1 gap-3">
				{sides.editor && sides.preview ? (
					<SplitPane id={id} label={label} min={320}>
						{editor}
					</SplitPane>
				) : sides.editor ? (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col *:flex-1">{editor}</div>
				) : null}
				{sides.preview ? preview : null}
			</div>
		</div>
	);
}
