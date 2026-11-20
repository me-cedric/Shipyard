import { useEffect, useRef } from "react";
import { type EditorError, toEditorError } from "./error-line";

/**
 * A BPMN view: pan and zoom. With `onChange` it is the bpmn-js modeler and emits the XML after
 * each change; it reads `text` once, so remount it with a `key` to load another file.
 * It loads bpmn-js on demand. The bpmn.io watermark stays visible: the licence forbids its removal.
 */
export function BpmnViewer({
	text,
	label,
	onChange,
	onError,
}: {
	text: string;
	/** The accessible name of the diagram. */
	label: string;
	onChange?: (xml: string) => void;
	onError?: (error: EditorError | null) => void;
}) {
	const host = useRef<HTMLDivElement>(null);
	const report = useRef(onError);
	report.current = onError;
	const change = useRef(onChange);
	change.current = onChange;
	const edit = !!onChange;
	useEffect(() => {
		let viewer: { destroy: () => void } | undefined;
		let stale = false;
		void (async () => {
			const [{ default: Viewer }] = await Promise.all([
				edit ? import("bpmn-js/lib/Modeler") : import("bpmn-js/lib/NavigatedViewer"),
				import("bpmn-js/dist/assets/diagram-js.css"),
				import("bpmn-js/dist/assets/bpmn-js.css"),
				edit ? import("bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css") : null,
			]);
			if (stale || !host.current) return;
			// The shapes take the colours of the theme: bpmn-js writes them as attributes, once.
			const style = getComputedStyle(host.current);
			const v = new Viewer({
				container: host.current,
				bpmnRenderer: {
					defaultFillColor: style.backgroundColor,
					defaultStrokeColor: style.color,
					defaultLabelColor: style.color,
				},
			});
			viewer = v;
			try {
				await v.importXML(text);
				const canvas = v.get("canvas") as {
					zoom: (to: string, center: string) => void;
					viewbox: (box?: object) => {
						scale: number;
						inner: { x: number; y: number; width: number; height: number };
					};
				};
				canvas.zoom("fit-viewport", "auto");
				// Keep room under the diagram: the bpmn.io mark sits bottom right and must stay clear.
				const { scale, inner } = canvas.viewbox();
				const pad = 8 / scale;
				canvas.viewbox({
					x: inner.x - pad,
					y: inner.y - pad,
					width: inner.width + 2 * pad,
					height: inner.height + pad + 32 / scale,
				});
				if (!stale) report.current?.(null);
				v.on("commandStack.changed", async () => {
					const { xml } = await v.saveXML({ format: true });
					if (!stale && xml) change.current?.(xml);
				});
			} catch (e) {
				if (!stale) report.current?.(toEditorError(e));
			}
		})();
		return () => {
			stale = true;
			viewer?.destroy();
		};
	}, [text, edit]);
	const box =
		"relative min-h-96 flex-1 overflow-hidden rounded-md border border-n-7 bg-n-1 text-n-12";
	// The modeler is a group of controls; the viewer is one picture.
	return edit ? (
		<fieldset aria-label={label} className="flex min-h-96 min-w-0 flex-1">
			<div ref={host} className={box} />
		</fieldset>
	) : (
		<div ref={host} role="img" aria-label={label} className={box} />
	);
}
