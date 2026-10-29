import { useEffect, useMemo } from "react";
import { CodeEditor } from "../molecules/code-editor";
import { isDrawioXml, svgDataUri, xmlFromDrawioSvg } from "./drawio";
import type { EditorError } from "./error-line";

/**
 * A read-only draw.io view (Q-040, option 1). A `.drawio.svg` shows as an image: it is a picture
 * that carries its model. A plain `.drawio` shows its XML read-only, because the draw.io editor
 * needs a Tauri URI scheme. A file that is not a board shows an error and no content.
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
	if (!ok) return null;
	return svg ? (
		<img
			src={svgDataUri(text)}
			alt={label}
			className="max-h-full max-w-full self-start rounded-md border border-n-7"
		/>
	) : (
		<CodeEditor label={label} value={text} readOnly className="flex-1" />
	);
}
