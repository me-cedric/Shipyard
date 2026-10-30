/**
 * The mxGraph model that a `.drawio.svg` carries in the `content` attribute of its root, or "".
 * A plain SVG has no model: it is not a board.
 */
export function xmlFromDrawioSvg(svg: string): string {
	try {
		const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
		if (doc.getElementsByTagName("parsererror").length > 0) return "";
		const content = doc.documentElement.getAttribute("content") ?? "";
		return content.trim().startsWith("<") ? content : "";
	} catch {
		return "";
	}
}

/** True when the text is a draw.io XML file. */
export function isDrawioXml(text: string): boolean {
	const doc = new DOMParser().parseFromString(text, "text/xml");
	if (doc.getElementsByTagName("parsererror").length > 0) return false;
	return ["mxfile", "mxGraphModel"].includes(doc.documentElement.tagName);
}

/** An SVG text as a data URI. It goes in an `<img>`, so a script in the file never runs. */
export const svgDataUri = (svg: string): string =>
	`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
