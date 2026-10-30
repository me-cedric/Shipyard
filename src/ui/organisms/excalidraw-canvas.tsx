import { Excalidraw, restore, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useEffect, useMemo, useRef } from "react";
import { useI18n } from "@/lib/i18n";

/** The scene of a text. The text is JSON, or empty for a new board. Throws on bad JSON. */
export function parseScene(text: string) {
	const scene = text.trim() ? JSON.parse(text) : {};
	// `restore` fills the fields that a partial element lacks, so the canvas does not crash on it.
	const restored = restore(
		{ elements: scene.elements ?? [], appState: scene.appState ?? {}, files: scene.files ?? {} },
		null,
		null,
	);
	return {
		...restored,
		// A stored scene carries `collaborators` as an array. Excalidraw expects a Map.
		appState: { ...restored.appState, collaborators: undefined },
		scrollToContent: true,
	};
}

/** The canvas. It reads `text` once and reports each change as JSON text. */
export default function ExcalidrawCanvas({
	text,
	dark,
	label,
	onChange,
}: {
	text: string;
	dark: boolean;
	label: string;
	onChange: (json: string) => void;
}) {
	const initialData = useMemo(() => parseScene(text), [text]);
	// The canvas reports once on mount and on a pan or zoom. Only a changed scene is a change.
	const last = useRef<string | null>(null);
	const { t } = useI18n();
	const box = useRef<HTMLFieldSetElement>(null);
	// shortcut: Excalidraw gives its menu button no name; the board names it until upstream does.
	useEffect(() => {
		const node = box.current;
		if (!node) return;
		const name = () =>
			node
				.querySelector(".main-menu-trigger:not([aria-label])")
				?.setAttribute("aria-label", t.ui.more);
		const watch = new MutationObserver(name);
		watch.observe(node, { childList: true, subtree: true });
		name();
		return () => watch.disconnect();
	}, [t]);
	return (
		// A group, not a landmark: the frame around it is the region of the file.
		<fieldset ref={box} aria-label={label} className="size-full min-h-96 min-w-0">
			<Excalidraw
				theme={dark ? "dark" : "light"}
				initialData={initialData}
				onChange={(elements, appState, files) => {
					const json = serializeAsJSON(elements, appState, files, "local");
					const first = last.current === null;
					if (json === last.current) return;
					last.current = json;
					if (!first) onChange(json);
				}}
			/>
		</fieldset>
	);
}
