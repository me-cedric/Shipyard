import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { IconButton } from "../atoms/icon-button";
import { Dialog } from "../organisms/dialog";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
const STEP = 1.25;
const NUDGE = 40;

/** The next scale, kept inside the limits. */
export const zoomBy = (scale: number, factor: number) =>
	Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * factor));

function Pane({
	label,
	children,
	onFull,
	className,
}: {
	label: string;
	children: ReactNode;
	/** Absent in the full screen pane. */
	onFull?: () => void;
	className?: string;
}) {
	const { t } = useI18n();
	const v = t.workspace.view;
	const [scale, setScale] = useState(1);
	const [at, setAt] = useState({ x: 0, y: 0 });
	const drag = useRef<{ x: number; y: number } | null>(null);
	const box = useRef<HTMLDivElement>(null);
	const zoom = (f: number) => setScale((s) => zoomBy(s, f));
	const reset = () => {
		setScale(1);
		setAt({ x: 0, y: 0 });
	};
	// React registers wheel as passive: Ctrl or Cmd plus wheel needs preventDefault to stop the page zoom.
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey && !e.metaKey) return;
			e.preventDefault();
			setScale((s) => zoomBy(s, Math.exp(-e.deltaY * 0.01)));
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);
	const onKeyDown = (e: KeyboardEvent) => {
		if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
		const pan: Record<string, [number, number]> = {
			ArrowLeft: [NUDGE, 0],
			ArrowRight: [-NUDGE, 0],
			ArrowUp: [0, NUDGE],
			ArrowDown: [0, -NUDGE],
		};
		const d = pan[e.key];
		if (d) setAt((p) => ({ x: p.x + d[0], y: p.y + d[1] }));
		else if (e.key === "+" || e.key === "=") zoom(STEP);
		else if (e.key === "-") zoom(1 / STEP);
		else if (e.key === "0") reset();
		else return;
		e.preventDefault();
	};
	return (
		<div className={cn("relative", className)}>
			<section
				ref={box}
				aria-label={`${v.zoomArea}: ${label}`}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: the keys zoom and pan the picture
				tabIndex={0}
				onKeyDown={onKeyDown}
				onPointerDown={(e) => {
					if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
					drag.current = { x: e.clientX - at.x, y: e.clientY - at.y };
					e.currentTarget.setPointerCapture(e.pointerId);
				}}
				onPointerMove={(e) => {
					const d = drag.current;
					if (d) setAt({ x: e.clientX - d.x, y: e.clientY - d.y });
				}}
				onPointerUp={() => {
					drag.current = null;
				}}
				onPointerCancel={() => {
					drag.current = null;
				}}
				className="h-full cursor-grab touch-none overflow-hidden rounded-md active:cursor-grabbing"
			>
				<div
					style={{
						transform: `translate(${at.x}px, ${at.y}px) scale(${scale})`,
						transformOrigin: "0 0",
					}}
				>
					{children}
				</div>
			</section>
			<div className="absolute top-1 right-1 flex gap-0.5 rounded-md border bg-surface-2 p-0.5">
				<IconButton label={v.zoomIn} onClick={() => zoom(STEP)} disabled={scale >= MAX_ZOOM}>
					+
				</IconButton>
				<IconButton label={v.zoomOut} onClick={() => zoom(1 / STEP)} disabled={scale <= MIN_ZOOM}>
					−
				</IconButton>
				<IconButton label={v.zoomFit} onClick={reset}>
					⊡
				</IconButton>
				{onFull ? (
					<IconButton label={v.fullScreen} onClick={onFull}>
						⛶
					</IconButton>
				) : null}
			</div>
		</div>
	);
}

/**
 * A frame for a read-only picture: plus, minus, fit, Ctrl or Cmd plus wheel, drag to pan, and a
 * full screen dialog. With the frame focused, + - 0 and the arrow keys do the same.
 */
export function ZoomFrame({
	label,
	children,
	className,
}: {
	/** The name of the picture. */
	label: string;
	children: ReactNode;
	className?: string;
}) {
	const [full, setFull] = useState(false);
	return (
		<>
			<Pane label={label} onFull={() => setFull(true)} className={className}>
				{children}
			</Pane>
			<Dialog open={full} onOpenChange={setFull} title={label} full>
				<Pane label={label} className="h-[75vh]">
					{children}
				</Pane>
			</Dialog>
		</>
	);
}
