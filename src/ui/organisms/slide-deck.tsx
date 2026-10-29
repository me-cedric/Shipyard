import Reveal from "reveal.js";
import "reveal.js/reveal.css";
import { type CSSProperties, useEffect, useRef } from "react";
import { MarkdownView } from "./markdown-view";

export type DeckStyle = { background: string; text: string; accent: string; font: string };

const reduced = () =>
	typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A deck on reveal.js. The text of a slide stays Markdown, and the file never changes (ADR 0013).
 * The theme sets the colours and the font. In present mode the deck covers the window: the arrows
 * move between slides and Escape calls `onLeave`. Reduced motion removes the transitions (REQ-019).
 */
export function SlideDeck({
	slides,
	style,
	label,
	slideLabel,
	present,
	onLeave,
}: {
	slides: string[];
	style: DeckStyle;
	label: string;
	/** The name of one slide, from its number. */
	slideLabel: (n: number) => string;
	present?: boolean;
	onLeave?: () => void;
}) {
	const root = useRef<HTMLElement>(null);
	const key = slides.join("\u0000");
	// biome-ignore lint/correctness/useExhaustiveDependencies: the key stands for the slides
	useEffect(() => {
		const el = root.current;
		if (!el) return;
		const deck = new Reveal(el, {
			embedded: !present,
			hash: false,
			controls: true,
			progress: true,
			// Escape leaves the present mode. It does not open the overview.
			keyboard: { 27: () => {} },
			transition: reduced() ? "none" : "slide",
			backgroundTransition: "none",
			plugins: [],
		});
		void deck.initialize();
		return () => {
			try {
				deck.destroy();
			} catch {
				// A deck that did not start has nothing to destroy.
			}
		};
	}, [key, present]);
	useEffect(() => {
		if (!present) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onLeave?.();
		document.addEventListener("keydown", onKey);
		// The browser leaves full screen with Escape too: follow it.
		const onFull = () => document.fullscreenElement === null && onLeave?.();
		document.addEventListener("fullscreenchange", onFull);
		void root.current?.requestFullscreen?.().catch(() => {});
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("fullscreenchange", onFull);
			if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
		};
	}, [present, onLeave]);
	return (
		<section
			ref={root}
			aria-label={label}
			data-present={present ? "" : undefined}
			className={
				present
					? "reveal fixed inset-0 z-50"
					: "reveal relative h-72 w-full overflow-hidden rounded-md border border-n-7"
			}
			style={
				{
					background: style.background,
					color: style.text,
					fontFamily: style.font,
					"--r-main-color": style.text,
					"--r-heading-color": style.accent,
					"--r-link-color": style.accent,
					"--r-background-color": style.background,
				} as CSSProperties
			}
		>
			<div className="slides">
				{slides.map((s, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: the slides keep their order
					<section key={i} className="text-left">
						<MarkdownView source={s} label={slideLabel(i + 1)} />
					</section>
				))}
			</div>
		</section>
	);
}
