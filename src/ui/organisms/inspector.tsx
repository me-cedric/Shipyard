import { motion } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
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
	const close = () => {
		if (ref.current?.contains(document.activeElement)) document.querySelector("main")?.focus();
		onClose();
	};
	// The card needs the width of its two buttons.
	const width = card ? Math.max(panel.size, 440) : panel.size;
	return (
		<>
			{/* The dim is a look only: the page under it stays in use. */}
			{card && open ? (
				<div
					aria-hidden="true"
					className="pointer-events-none fixed inset-0 z-30 bg-surface-1/50"
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
						? "fixed top-23 right-8 z-40 max-h-[calc(100vh-7.5rem)] rounded-lg border-2 border-accent bg-surface-2"
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
					className="left-0"
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
