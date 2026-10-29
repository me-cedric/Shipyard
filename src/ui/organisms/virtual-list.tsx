import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";

/** Used when the list has no layout yet (a test, a hidden tab): the first rows still render. */
const FALLBACK = { width: 800, height: 600 };

/**
 * A long list that draws only the rows in view. Every row is one fixed height, so 10 000 rows cost
 * as little as 20. Up and Down move the focus between the elements that carry `data-nav`.
 */
export function VirtualList<T>({
	items,
	itemKey,
	renderItem,
	isRow = () => true,
	rowHeight = 28,
	header,
	width,
	className,
	children,
}: {
	items: T[];
	itemKey: (item: T, index: number) => string;
	renderItem: (item: T, index: number) => ReactNode;
	/** False for a heading: the focus keys skip it. */
	isRow?: (item: T) => boolean;
	rowHeight?: number;
	/** Stays on top while the rows scroll. */
	header?: ReactNode;
	/** The width of the content in px, when it is wider than the list. */
	width?: number;
	className?: string;
	/** Drawn behind the rows, over the whole content (the weekends of a plan). */
	children?: ReactNode;
}) {
	const scroller = useRef<HTMLDivElement>(null);
	const v = useVirtualizer({
		count: items.length,
		getScrollElement: () => scroller.current,
		estimateSize: () => rowHeight,
		getItemKey: (i) => {
			const item = items[i];
			return item === undefined ? i : itemKey(item, i);
		},
		overscan: 12,
		observeElementRect: (instance, cb) =>
			observeElementRect(instance, (r) => cb(r.height === 0 ? FALLBACK : r)),
	});

	const move = (from: number, step: 1 | -1) => {
		for (let i = from + step; i >= 0 && i < items.length; i += step) {
			const item = items[i];
			if (item === undefined || !isRow(item)) continue;
			v.scrollToIndex(i);
			// The row may not exist yet: wait for the frame that draws it.
			requestAnimationFrame(() =>
				scroller.current?.querySelector<HTMLElement>(`[data-index="${i}"] [data-nav]`)?.focus(),
			);
			return;
		}
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the key handler only moves the focus between the rows inside
		<div
			ref={scroller}
			className={cn("relative min-h-0 flex-1 overflow-auto", className)}
			onKeyDown={(e) => {
				if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
				const at = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
				if (!at || !(e.target as HTMLElement).closest("[data-nav]")) return;
				e.preventDefault();
				move(Number(at.dataset.index), e.key === "ArrowDown" ? 1 : -1);
			}}
		>
			{header ? <div className="sticky top-0 z-20 bg-n-1">{header}</div> : null}
			<div
				className="relative"
				style={{ height: v.getTotalSize(), minWidth: width, width: width ? undefined : "100%" }}
			>
				{children}
				{v.getVirtualItems().map((row) => {
					const item = items[row.index];
					if (item === undefined) return null;
					return (
						<div
							key={row.key}
							data-index={row.index}
							className="absolute top-0 left-0 w-full"
							style={{ height: row.size, transform: `translateY(${row.start}px)` }}
						>
							{renderItem(item, row.index)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
