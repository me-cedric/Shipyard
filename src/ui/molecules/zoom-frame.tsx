import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { IconButton } from "../atoms/icon-button";
import { Dialog } from "../organisms/dialog";

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
const STEP = 1.25;
const NUDGE = 40;

/** The next scale, kept inside the limits. */
export const zoomBy = (scale: number, factor: number) =>
	Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * factor));

type Size = { width: number; height: number };
type At = { x: number; y: number };
const KEEP = 48;

/** The scale and the offset that show the whole content in the frame, centred. */
export function fitTo(box: Size, content: Size): { scale: number; at: At } {
	if (!(box.width > 0 && box.height > 0 && content.width > 0 && content.height > 0))
		return { scale: 1, at: { x: 0, y: 0 } };
	const scale = zoomBy(1, Math.min(box.width / content.width, box.height / content.height));
	return {
		scale,
		at: {
			x: (box.width - content.width * scale) / 2,
			y: (box.height - content.height * scale) / 2,
		},
	};
}

/** Keep at least `KEEP` px of the content in the frame on each axis, so a pan cannot lose it. */
export function clampAt(at: At, scale: number, box: Size, content: Size): At {
	if (!(box.width > 0 && box.height > 0 && content.width > 0 && content.height > 0)) return at;
	const one = (v: number, b: number, c: number) => {
		const keep = Math.min(KEEP, b, c * scale);
		return Math.min(b - keep, Math.max(keep - c * scale, v));
	};
	return { x: one(at.x, box.width, content.width), y: one(at.y, box.height, content.height) };
}

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
	const picture = useRef<HTMLDivElement>(null);
	// The frame fits the picture until the person zooms or pans: a diagram renders after the mount.
	const touched = useRef(false);
	const scaleRef = useRef(1);
	const panRef = useRef((_dx: number, _dy: number) => {});
	scaleRef.current = scale;
	const zoom = (f: number) => {
		touched.current = true;
		setScale((s) => zoomBy(s, f));
	};
	/** The scale that shows the whole picture in the frame, centred. */
	const fitView = useCallback(() => {
		const b = box.current;
		const p = picture.current;
		const r = fitTo(
			{ width: b?.clientWidth ?? 0, height: b?.clientHeight ?? 0 },
			{ width: p?.offsetWidth ?? 0, height: p?.offsetHeight ?? 0 },
		);
		setScale(r.scale);
		setAt(r.at);
	}, []);
	/** Move the picture, inside the pan limits. */
	const place = (to: (a: At) => At) => {
		const b = box.current;
		const p = picture.current;
		touched.current = true;
		setAt((a) =>
			clampAt(
				to(a),
				scaleRef.current,
				{ width: b?.clientWidth ?? 0, height: b?.clientHeight ?? 0 },
				{ width: p?.offsetWidth ?? 0, height: p?.offsetHeight ?? 0 },
			),
		);
	};
	const panBy = (dx: number, dy: number) => place((a) => ({ x: a.x + dx, y: a.y + dy }));
	const reset = () => {
		touched.current = false;
		fitView();
	};
	useEffect(() => {
		const b = box.current;
		const p = picture.current;
		if (!(b && p) || typeof ResizeObserver === "undefined") return;
		const again = new ResizeObserver(() => {
			if (!touched.current) fitView();
		});
		again.observe(b);
		again.observe(p);
		return () => again.disconnect();
	}, [fitView]);
	// React registers wheel as passive: Ctrl or Cmd plus wheel needs preventDefault to stop the page zoom.
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (e.ctrlKey || e.metaKey) {
				e.preventDefault();
				touched.current = true;
				setScale((s) => zoomBy(s, Math.exp(-e.deltaY * 0.01)));
				return;
			}
			// Only a sideways gesture on a wide picture, or a deliberate one (focus, Shift), pans: else the page scrolls.
			const wide = (picture.current?.offsetWidth ?? 0) * scaleRef.current > el.clientWidth;
			const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
			if (sideways ? !wide : !(e.shiftKey || document.activeElement === el)) return;
			e.preventDefault();
			panRef.current(-e.deltaX, -e.deltaY);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);
	panRef.current = panBy;
	const onKeyDown = (e: KeyboardEvent) => {
		if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
		const pan: Record<string, [number, number]> = {
			ArrowLeft: [NUDGE, 0],
			ArrowRight: [-NUDGE, 0],
			ArrowUp: [0, NUDGE],
			ArrowDown: [0, -NUDGE],
		};
		const d = pan[e.key];
		if (d) {
			panBy(d[0], d[1]);
		} else if (e.key === "+" || e.key === "=") zoom(STEP);
		else if (e.key === "-") zoom(1 / STEP);
		else if (e.key === "0") reset();
		else return;
		e.preventDefault();
	};
	return (
		<div className={cn("relative h-[60vh]", className)}>
			<section
				ref={box}
				aria-label={`${v.zoomArea}: ${label}`}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: the keys zoom and pan the picture
				tabIndex={0}
				onKeyDown={onKeyDown}
				onPointerDown={(e) => {
					if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
					touched.current = true;
					drag.current = { x: e.clientX - at.x, y: e.clientY - at.y };
					e.currentTarget.setPointerCapture(e.pointerId);
				}}
				onPointerMove={(e) => {
					const d = drag.current;
					if (d) place(() => ({ x: e.clientX - d.x, y: e.clientY - d.y }));
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
					ref={picture}
					// The picture keeps its own size, so the fit can measure it.
					className="w-max"
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
 * A frame for a read-only picture: plus, minus, fit, Ctrl or Cmd plus wheel to zoom, drag or wheel
 * to pan, and a
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
				<Pane label={label} className="h-full">
					{children}
				</Pane>
			</Dialog>
		</>
	);
}
