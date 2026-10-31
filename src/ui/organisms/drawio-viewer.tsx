import { useEffect, useMemo, useState } from "react";
import { CodeEditor } from "../molecules/code-editor";
import { drawioSvg, isDrawioXml, svgDataUri, xmlFromDrawioSvg } from "./drawio";
import type { EditorError } from "./error-line";

/**
 * A read-only draw.io view (Q-040, option 1). A `.drawio.svg` shows as an image: it is a picture
 * that carries its model. A plain `.drawio` is drawn from its model, offline; when the model has
 * nothing to draw, it shows the XML read-only. A file that is not a board shows an error and no content.
 */
export function DrawioViewer({
	text,
	svg,
	label,
	invalid,
	onError,
}: {
	text: string;
	/** True for a `.drawio.svg` file. */
	svg: boolean;
	/** The accessible name of the view. */
	label: string;
	/** The message for a file that is not a draw.io board. */
	invalid: string;
	onError?: (error: EditorError | null) => void;
}) {
	const ok = useMemo(() => (svg ? xmlFromDrawioSvg(text) !== "" : isDrawioXml(text)), [svg, text]);
	useEffect(() => onError?.(ok ? null : { message: invalid }), [ok, invalid, onError]);
	// The drawing of a plain file: undefined while it is made, "" when there is nothing to draw.
	const [drawn, setDrawn] = useState<string>();
	useEffect(() => {
		let live = true;
		setDrawn(svg ? text : undefined);
		if (!svg && ok) void drawioSvg(text, false).then((d) => live && setDrawn(d));
		return () => {
			live = false;
		};
	}, [svg, ok, text]);
	if (!ok || drawn === undefined) return null;
	return drawn ? (
		<img
			src={svgDataUri(drawn)}
			alt={label}
			className="max-h-full max-w-full self-start rounded-md border border-n-7"
		/>
	) : (
		<CodeEditor label={label} value={text} readOnly className="flex-1" />
	);
}
