import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { usePanelSize } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { Splitter } from "./splitter";

/**
 * The first pane of a row (or of a column with `height`), with a handle on its far edge. The size
 * is kept per person under `id`. With no `fallback` the pane starts at half of its parent, for an
 * editor and its preview. The other pane keeps at least 20rem. Give the other pane `min-w-0 flex-1`.
 */
export function SplitPane({
	id,
	label,
	fallback,
	min = 200,
	max = 800,
	height = false,
	className,
	children,
}: {
	id: string;
	label: string;
	fallback?: number;
	min?: number;
	max?: number;
	/** Resize a height, not a width. */
	height?: boolean;
	className?: string;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [half, setHalf] = useState(0);
	const panel = usePanelSize(id, fallback ?? half);
	useLayoutEffect(() => {
		const parent = ref.current?.parentElement;
		if (fallback !== undefined || !parent) return;
		// 12 px is the gap of the row.
		const measure = () => setHalf(Math.round((parent.clientWidth - 12) / 2));
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const watch = new ResizeObserver(measure);
		watch.observe(parent);
		return () => watch.disconnect();
	}, [fallback]);
	return (
		<div
			ref={ref}
			style={
				height ? { height: panel.size } : { width: panel.size, maxWidth: "calc(100% - 20rem)" }
			}
			className={cn(
				"relative flex shrink-0",
				height ? "flex-col *:min-h-0 *:flex-1" : "*:min-w-0 *:flex-1",
				className,
			)}
		>
			{children}
			<Splitter
				label={label}
				value={panel.size}
				min={min}
				max={max}
				vertical={!height}
				onChange={panel.set}
				onReset={panel.reset}
				className={height ? "-bottom-2" : "-right-2"}
			/>
		</div>
	);
}
