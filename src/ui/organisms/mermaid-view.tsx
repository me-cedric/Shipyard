import { ZoomFrame } from "../molecules/zoom-frame";
import type { EditorError } from "./error-line";
import { useDark } from "./use-dark";
import { useRender } from "./use-render";

let seq = 0;

/**
 * The SVG of a Mermaid text. `securityLevel: "strict"` runs DOMPurify over the output. With
 * `textLabels`, a label is SVG text, not HTML, so a canvas can draw the picture.
 */
export function renderMermaid(source: string, dark: boolean, textLabels = false): Promise<string> {
	// One render at a time: `initialize` sets global state that two renders must not share.
	const run = queue.then(() => renderOne(source, dark, textLabels));
	queue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

let queue: Promise<void> = Promise.resolve();

async function renderOne(source: string, dark: boolean, textLabels: boolean): Promise<string> {
	const { default: mermaid } = await import("mermaid");
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "strict",
		theme: dark ? "dark" : "default",
		htmlLabels: !textLabels,
		flowchart: { htmlLabels: !textLabels },
	});
	await mermaid.parse(source);
	const id = `mermaid-${seq++}`;
	try {
		return (await mermaid.render(id, source)).svg;
	} finally {
		// A failed render leaves its measuring node in the page.
		document.getElementById(`d${id}`)?.remove();
	}
}

/** Render a Mermaid text. A broken text keeps the last good SVG and reports its error with the line. */
export function MermaidView({
	source,
	label,
	onError,
	plain,
}: {
	source: string;
	/** The accessible name of the picture. */
	label: string;
	onError?: (error: EditorError | null) => void;
	/** No zoom frame: a thumbnail. */
	plain?: boolean;
}) {
	const dark = useDark();
	const svg = useRender(
		`${dark ? "d" : "l"}${source}`,
		(s) => renderMermaid(s.slice(1), s[0] === "d"),
		onError,
	);
	const picture = (
		<div
			role="img"
			aria-label={label}
			className={
				plain
					? "h-full min-h-40 overflow-auto rounded-md border border-n-7 bg-n-1 p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
					: "p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
			}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid output, sanitised with securityLevel "strict"
			dangerouslySetInnerHTML={{ __html: svg ?? "" }}
		/>
	);
	return plain ? (
		picture
	) : (
		<ZoomFrame label={label} className="h-full min-h-40 rounded-md border border-n-7 bg-n-1">
			{picture}
		</ZoomFrame>
	);
}
