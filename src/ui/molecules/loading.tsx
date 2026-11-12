import { type ReactNode, useLayoutEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "../atoms/skeleton";
import { DURATION, prefersReducedMotion } from "../motion";
import { PageHeader } from "./page-header";

/** The pending fade-out timeout of each marked parent, so marks never stack. */
const marks = new WeakMap<Element, number>();

/**
 * Skeleton rows that pulse while a page loads. The pulse stops with reduced motion. With a `title`
 * the head of the page shows above the rows, so the page keeps its name while it loads. When the
 * same page then loads (its header shows the same title), the parent gets `data-reveal` for a
 * moment and the content under the header fades in (`tokens.css`). The header never fades.
 */
export function Loading({
	rows = 6,
	title,
	icon,
}: {
	rows?: number;
	title?: string;
	icon?: ReactNode;
}) {
	const { t } = useI18n();
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		if (!title) return;
		// The parent is read at setup: on unmount the node may already be gone.
		const parent = ref.current?.parentElement;
		if (!parent) return;
		return () => {
			// A microtask runs after the commit and before the paint: a frame later the content would blink.
			queueMicrotask(() => {
				if (prefersReducedMotion() || !parent.isConnected) return;
				// Still loading (StrictMode, or a Suspense fallback swapped for the page's own Loading).
				if (parent.querySelector("[data-loading]")) return;
				const same = [...parent.querySelectorAll("h1")].some((h) => h.textContent === title);
				if (!same) return;
				clearTimeout(marks.get(parent));
				parent.dataset.reveal = "";
				marks.set(
					parent,
					window.setTimeout(() => {
						delete parent.dataset.reveal;
						marks.delete(parent);
					}, DURATION.fast + 50),
				);
			});
		};
	}, [title]);
	return (
		<>
			{title ? <PageHeader icon={icon} title={title} /> : null}
			<div
				ref={ref}
				data-loading
				role="status"
				aria-label={t.common.loading}
				className="flex flex-col gap-3 p-4"
			>
				{Array.from({ length: rows }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: the rows are identical and never reorder
					<Skeleton key={i} className="h-8 w-full motion-safe:animate-status-pulse" />
				))}
			</div>
		</>
	);
}
