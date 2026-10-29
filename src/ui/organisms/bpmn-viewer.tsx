import { useEffect, useRef } from "react";
import { type EditorError, toEditorError } from "./error-line";

/**
 * A read-only BPMN view: pan and zoom, no edit. It loads bpmn-js on demand.
 * The bpmn.io watermark stays visible: the licence forbids its removal.
 */
export function BpmnViewer({
	text,
	label,
	onError,
}: {
	text: string;
	/** The accessible name of the diagram. */
	label: string;
	onError?: (error: EditorError | null) => void;
}) {
	const host = useRef<HTMLDivElement>(null);
	const report = useRef(onError);
	report.current = onError;
	useEffect(() => {
		let viewer: { destroy: () => void } | undefined;
		let stale = false;
		void (async () => {
			const [{ default: Viewer }] = await Promise.all([
				import("bpmn-js/lib/NavigatedViewer"),
				import("bpmn-js/dist/assets/diagram-js.css"),
				import("bpmn-js/dist/assets/bpmn-js.css"),
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
				(v.get("canvas") as { zoom: (to: string, center: string) => void }).zoom(
					"fit-viewport",
					"auto",
				);
				if (!stale) report.current?.(null);
			} catch (e) {
				if (!stale) report.current?.(toEditorError(e));
			}
		})();
		return () => {
			stale = true;
			viewer?.destroy();
		};
	}, [text]);
	return (
		<div
			ref={host}
			role="img"
			aria-label={label}
			className="relative min-h-96 flex-1 overflow-hidden rounded-md border border-n-7 bg-n-1 text-n-12"
		/>
	);
}
