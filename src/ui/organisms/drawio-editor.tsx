import { type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isDrawioXml, xmlFromDrawioSvg } from "./drawio";
import { useDark } from "./use-dark";

/** The only origin that can show in a frame (CSP `frame-src`) and send a message (ADR 0015). */
export const DRAWIO_ORIGIN = "https://embed.diagrams.net";
/** The editor that does not answer in this time shows the read-only view. */
const WAIT_MS = 15_000;

const subscribe = (cb: () => void) => {
	addEventListener("online", cb);
	addEventListener("offline", cb);
	return () => {
		removeEventListener("online", cb);
		removeEventListener("offline", cb);
	};
};

/** The SVG text of an export data URI. */
export function svgOfDataUri(uri: string): string {
	const comma = uri.indexOf(",");
	const head = uri.slice(0, comma);
	const body = uri.slice(comma + 1);
	if (!head.endsWith(";base64")) return decodeURIComponent(body);
	return new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)));
}

/**
 * The draw.io editor through the official embed protocol (ADR 0015): an iframe in embed mode with
 * `proto=json`. It loads `text` once and emits the file text after each change; a `.drawio.svg`
 * comes back as an SVG with its model. Offline, for a file that is not a board, or when the editor
 * does not answer, it shows `fallback`. Only messages from the draw.io origin and its own frame count.
 */
export function DrawioEditor({
	text,
	svg,
	label,
	lang,
	onChange,
	fallback,
}: {
	text: string;
	/** True for a `.drawio.svg` file. */
	svg: boolean;
	/** The accessible name of the editor. */
	label: string;
	lang: string;
	onChange: (text: string) => void;
	/** The read-only view. */
	fallback: ReactNode;
}) {
	const online = useSyncExternalStore(subscribe, () => navigator.onLine);
	const dark = useDark();
	const frame = useRef<HTMLIFrameElement>(null);
	const [silent, setSilent] = useState(false);
	const change = useRef(onChange);
	change.current = onChange;
	const xml = useMemo(
		() => (svg ? xmlFromDrawioSvg(text) : isDrawioXml(text) ? text : ""),
		[svg, text],
	);
	useEffect(() => {
		if (!online || !xml) return;
		const timer = setTimeout(() => setSilent(true), WAIT_MS);
		const send = (m: object) =>
			frame.current?.contentWindow?.postMessage(JSON.stringify(m), DRAWIO_ORIGIN);
		const receive = (e: MessageEvent) => {
			if (e.origin !== DRAWIO_ORIGIN || e.source !== frame.current?.contentWindow) return;
			if (typeof e.data !== "string") return;
			let m: { event?: string; xml?: unknown; data?: unknown };
			try {
				m = JSON.parse(e.data);
			} catch {
				return;
			}
			if (m.event === "init") {
				clearTimeout(timer);
				send({ action: "load", xml, autosave: 1 });
			} else if (m.event === "autosave" && typeof m.xml === "string") {
				if (svg) send({ action: "export", format: "xmlsvg" });
				else change.current(m.xml);
			} else if (m.event === "export" && typeof m.data === "string") {
				change.current(svgOfDataUri(m.data));
			}
		};
		addEventListener("message", receive);
		return () => {
			clearTimeout(timer);
			removeEventListener("message", receive);
		};
	}, [online, xml, svg]);
	if (!online || silent || !xml) return fallback;
	const query = `embed=1&proto=json&spin=1&noSaveBtn=1&noExitBtn=1&saveAndExit=0&ui=min&dark=${dark ? 1 : 0}&lang=${lang}`;
	return (
		<iframe
			ref={frame}
			title={label}
			src={`${DRAWIO_ORIGIN}/?${query}`}
			// The editor runs in its own origin: no script of the app, no top navigation.
			sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
			className="min-h-96 w-full flex-1 rounded-md border border-n-7"
		/>
	);
}
