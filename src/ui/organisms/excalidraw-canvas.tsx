import { Excalidraw, restore, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useMemo, useRef } from "react";

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
	return (
		<section aria-label={label} className="size-full min-h-96">
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
		</section>
	);
}
