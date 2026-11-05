import { commands, unwrap, type ViewImage } from "@/lib/ipc";
import { renderMermaid } from "@/ui/organisms/mermaid-view";

const MAX_SIDE = 4000;

/** The base64 text of a PNG file that holds the SVG. It fails when the webview cannot draw it. */
export async function svgToPng(svg: string): Promise<string> {
	const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
	const [, , w = 0, h = 0] = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
	if (!(w > 0 && h > 0)) throw new Error("the picture has no size");
	root.setAttribute("width", String(w));
	root.setAttribute("height", String(h));
	const img = new Image();
	img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;
	await img.decode();
	const scale = Math.min(2, MAX_SIDE / Math.max(w, h));
	const canvas = document.createElement("canvas");
	canvas.width = Math.ceil(w * scale);
	canvas.height = Math.ceil(h * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("no canvas");
	// The diagram renders in the light theme: it sits on white in any app theme.
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	const png = canvas.toDataURL("image/png").split(",")[1];
	if (!png) throw new Error("no PNG");
	return png;
}

/**
 * The Mermaid diagrams of the project as PNG, for the dossier. A diagram that does not render
 * keeps an empty `png`, and the dossier shows its source as a code block.
 */
export async function renderViews(): Promise<ViewImage[]> {
	const out: ViewImage[] = [];
	for (const d of await unwrap(commands.exportDiagramsGet())) {
		let png = "";
		try {
			png = await svgToPng(await renderMermaid(d.source, false, true));
		} catch {
			// The dossier keeps the source as a code block.
		}
		out.push({ title: d.title, source: d.source, png });
	}
	return out;
}
