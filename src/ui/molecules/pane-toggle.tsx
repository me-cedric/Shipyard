import { type ReactNode, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useViewState } from "@/lib/shell/view-state";
import { SectionSwitch } from "./section-switch";
import { SplitPane } from "./split-pane";

type Sides = { editor: boolean; preview: boolean };
type Choice = "preview" | "both" | "editor";
const SIDES: Record<Choice, Sides> = {
	preview: { editor: false, preview: true },
	both: { editor: true, preview: true },
	editor: { editor: true, preview: false },
};

/**
 * Which side of a text and its picture shows, kept per view. The picture alone is the default
 * (spec:app-redesign#REQ-021). `needText` is an action that needs the text, such as a new file or
 * an error with a line: when it starts, the text shows until the person picks a side. The stored
 * choice does not change.
 */
export function useSides(id: string, needText = false) {
	const [stored, set] = useViewState<Sides>(`sides:${id}`, SIDES.preview);
	const [forced, setForced] = useState(needText);
	const [was, setWas] = useState(needText);
	if (needText !== was) {
		setWas(needText);
		if (needText) setForced(true);
	}
	const sides = forced ? { ...stored, editor: true } : stored;
	const choose = (choice: Choice) => {
		setForced(false);
		set(SIDES[choice]);
	};
	return { sides, choose };
}

/**
 * One switch: the picture, both sides, or the text. `read` names the first side "Read", for a text
 * document. `textOnly` leaves that first side out: the page is in Edit, so the text must show.
 */
export function SideSwitch({
	sides,
	choose,
	read,
	textOnly,
}: {
	sides: Sides;
	choose: (choice: Choice) => void;
	read?: boolean;
	textOnly?: boolean;
}) {
	const { t } = useI18n();
	const s = t.editing.sides;
	const v = t.editing.view;
	const current: Choice = !sides.editor ? "preview" : sides.preview ? "both" : "editor";
	const labels: Record<Choice, string> = {
		preview: read ? s.read : s.picture,
		both: s.both,
		editor: v.text,
	};
	return (
		<SectionSwitch
			label={v.label}
			items={(["preview", "both", "editor"] as const)
				.filter((id) => !(textOnly && id === "preview"))
				.map((id) => ({ id, label: labels[id], current: id === current }))}
			onSelect={(id) => choose(id as Choice)}
		/>
	);
}

/**
 * A text and its picture, with the switch above them. With both sides the text sits in a
 * resizable pane; with one side, that side takes the row. `preview` brings its own wrapper
 * (`min-w-0 flex-1`).
 */
export function EditorPreview({
	id,
	label,
	editor,
	preview,
	needText,
}: {
	/** The key of the view: the choice and the pane width are kept under it. */
	id: string;
	/** The name of the resize handle. */
	label: string;
	editor: ReactNode;
	preview: ReactNode;
	/** An action needs the text: it shows. */
	needText?: boolean;
}) {
	const { sides, choose } = useSides(id, needText);
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<div className="flex justify-end">
				<SideSwitch sides={sides} choose={choose} />
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
