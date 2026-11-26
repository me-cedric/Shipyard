import { motion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePanelSize } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { IconButton } from "../atoms/icon-button";
import { XMarkIcon } from "../icons";
import { Splitter } from "../molecules/splitter";
import { SPRING, useReducedMotionPref } from "../motion";

/**
 * A side panel, 320 px at first. The person resizes it. The width change follows the smooth spring, but not during a drag.
 * `card` shows it as a card over the dimmed page: the card that explains a link.
 */
export function Inspector({
	open,
	onClose,
	title,
	card,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	card?: boolean;
	children: ReactNode;
}) {
	const { t } = useI18n();
	const ref = useRef<HTMLElement>(null);
	const panel = usePanelSize("inspector-width", 320);
	// A width transition while the pointer drags is the lag: the panel trails the pointer.
	// The bubbling pointer events of the separator set it, so no other path of the drag can miss it.
	const [resizing, setResizing] = useState(false);
	const still = useReducedMotionPref();
	const stop = () => setResizing(false);
	// The panel turns inert on close: move the focus out first, so it does not drop to <body>.
	// The element that had the focus when the panel opened: the focus goes back to it on close.
	const opener = useRef<HTMLElement | null>(null);
	useLayoutEffect(() => {
		if (!open) opener.current = null;
		else if (!ref.current?.contains(document.activeElement))
			opener.current = document.activeElement as HTMLElement | null;
	}, [open]);
	const close = () => {
		if (ref.current?.contains(document.activeElement)) {
			const main = document.querySelector("main");
			(opener.current?.isConnected ? opener.current : main)?.focus();
			// The opener can refuse the focus (the body, a disabled control): the page takes it then.
			if (ref.current.contains(document.activeElement)) main?.focus();
		}
		onClose();
	};
	// The link card closes on Escape wherever the focus is: the page under it stays in use.
	useEffect(() => {
		if (!(card && open)) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !e.defaultPrevented) close();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	});
	// The card needs the width of its two buttons.
	const width = card ? Math.max(panel.size, 476) : panel.size;
	return (
		<>
			{/* The dim is a look only: the page under it stays in use. */}
			{card && open ? (
				<div
					aria-hidden="true"
					className="pointer-events-none fixed inset-0 z-(--z-dim) bg-surface-1/50"
				/>
			) : null}
			<motion.aside
				ref={ref}
				aria-label={title}
				inert={!open}
				data-open={open}
				onKeyDown={(e) => {
					if (e.key === "Escape") close();
				}}
				data-resizing={resizing || undefined}
				onPointerDown={(e) => {
					if ((e.target as HTMLElement).closest("[role=separator]")) setResizing(true);
				}}
				onPointerUp={stop}
				onPointerCancel={stop}
				onLostPointerCapture={stop}
				initial={false}
				animate={{ width: open ? width : 0 }}
				transition={resizing || still ? { duration: 0 } : SPRING.smooth}
				className={cn(
					"max-w-[60vw] shrink-0 overflow-hidden transition-[border-color] duration-(--duration-base) ease-standard data-[open=false]:border-transparent",
					card
						? "fixed top-23 right-8 z-(--z-backdrop) max-h-[calc(100vh-7.5rem)] rounded-lg border-2 border-accent bg-surface-2"
						: "relative border-l",
					card && open && "shadow-3",
				)}
			>
				<Splitter
					label={t.ui.resize.inspector}
					value={panel.size}
					min={240}
					max={880}
					invert
					onChange={panel.set}
					onReset={panel.reset}
					// The hit area grows 6 px inward, inside the padding of the inspector.
					className="left-0 before:absolute before:inset-y-0 before:left-0 before:-right-1.5"
				/>
				{/* Full width of the aside; the floor keeps the text whole while the aside opens from 0. */}
				<div className="flex h-full w-full min-w-60 flex-col">
					<div
						className={
							card
								? "absolute top-5 right-5 z-10"
								: "flex min-h-control items-center justify-between border-b pr-1 pl-3"
						}
					>
						<h2 className={card ? "sr-only" : "text-ui font-medium"}>{title}</h2>
						<IconButton
							label={t.common.close}
							shortcut="Esc"
							variant={card ? "outline" : undefined}
							onClick={close}
						>
							<XMarkIcon size={14} />
						</IconButton>
					</div>
					<div
						className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", card ? "p-6" : "p-3")}
					>
						{children}
					</div>
				</div>
			</motion.aside>
		</>
	);
}
