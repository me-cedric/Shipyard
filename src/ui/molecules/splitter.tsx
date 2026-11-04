import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { cn } from "@/lib/utils";

const STEP = 16;

/**
 * The handle that resizes a panel. A drag or an arrow key moves the edge. Home and End go to the
 * limits and a double-click resets the size. `invert` is for a panel whose far edge is the start
 * of the axis (right of the main view, or under it): moving the handle toward the start widens it.
 * `onChange(size, false)` runs during a drag, and `onChange(size, true)` when the size is final.
 */
export function Splitter({
	label,
	value,
	min,
	max,
	vertical = true,
	invert = false,
	onChange,
	onReset,
	className,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	/** A vertical bar resizes a width. A horizontal bar resizes a height. */
	vertical?: boolean;
	invert?: boolean;
	onChange: (size: number, persist: boolean) => void;
	onReset: () => void;
	className?: string;
}) {
	const start = useRef<{ at: number; size: number } | null>(null);
	const sign = invert ? -1 : 1;
	const clamp = (n: number) => Math.min(max, Math.max(min, n));
	const [more, less] = vertical ? ["ArrowRight", "ArrowLeft"] : ["ArrowDown", "ArrowUp"];
	const at = (e: PointerEvent) => (vertical ? e.clientX : e.clientY);
	const onKey = (e: KeyboardEvent) => {
		const step = e.key === more ? STEP : e.key === less ? -STEP : 0;
		if (step) onChange(clamp(value + step * sign), true);
		else if (e.key === "Home") onChange(min, true);
		else if (e.key === "End") onChange(max, true);
		else return;
		e.preventDefault();
	};
	const end = () => {
		if (!start.current) return;
		start.current = null;
		onChange(value, true);
	};
	return (
		// biome-ignore lint/a11y/useSemanticElements: a window splitter is a focusable separator
		<div
			role="separator"
			aria-orientation={vertical ? "vertical" : "horizontal"}
			aria-label={label}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={value}
			tabIndex={0}
			onKeyDown={onKey}
			onDoubleClick={onReset}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture?.(e.pointerId);
				start.current = { at: at(e), size: value };
			}}
			onPointerMove={(e) => {
				if (start.current)
					onChange(clamp(start.current.size + (at(e) - start.current.at) * sign), false);
			}}
			onPointerUp={end}
			// A cancel or a lost capture ends the drag too. The guard stops a second save after a pointer up.
			onPointerCancel={end}
			onLostPointerCapture={end}
			className={cn(
				"absolute z-10 touch-none hover:bg-accent-subtle focus-visible:bg-accent-subtle",
				vertical ? "inset-y-0 w-1.5 cursor-col-resize" : "inset-x-0 h-1.5 cursor-row-resize",
				className,
			)}
		/>
	);
}
