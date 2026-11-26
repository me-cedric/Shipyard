import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePanelSize } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { Splitter } from "../molecules/splitter";
import { SPRING, useReducedMotionPref } from "../motion";

/**
 * The rail (72 px closed, 216 px open) flat on the page background, then the page area: the top
 * row and the main view. No bar on top and no bar at the bottom.
 */
export function Shell({
	contextbar,
	sidebar,
	main,
	inspector,
	sidebarOpen = true,
	assistant,
	assistantSide = "right",
	drawer,
	bottom,
	bottomDock = "bottom",
	navSide = "left",
	drawerSide = "left",
	bare,
}: {
	/** The top row of the page area: the rail toggle, Back, Forward, the Ask bar and the sync mark. */
	contextbar?: ReactNode;
	sidebar: ReactNode;
	main: ReactNode;
	inspector?: ReactNode;
	sidebarOpen?: boolean;
	/** A side panel that sits left or right of the main view. */
	assistant?: ReactNode;
	assistantSide?: "left" | "right";
	/** A drawer between the sidebar and the main view, such as the files. */
	drawer?: ReactNode;
	/** A drawer under the main view, such as the terminals. */
	bottom?: ReactNode;
	/** Where `bottom` docks: under the main view or beside it. */
	bottomDock?: "bottom" | "left" | "right";
	/** The side of the sidebar. */
	navSide?: "left" | "right";
	/** The side of `drawer`. */
	drawerSide?: "left" | "right";
	/** A page that shows alone (the first run, no project is open): no rail, and the page sets its own padding. */
	bare?: boolean;
}) {
	const { t } = useI18n();
	const panel = usePanelSize("sidebar-width", 216);
	const [resizing, setResizing] = useState(false);
	const still = useReducedMotionPref();
	// The rail width is in rem: the pointer delta in px needs the root scale.
	const scale = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
	const nav = (
		<motion.nav
			aria-label={t.nav.sidebar}
			data-open={sidebarOpen}
			initial={false}
			animate={{ width: sidebarOpen ? `${panel.size / 16}rem` : "4.5rem" }}
			// A drag follows the pointer at once.
			transition={resizing || still ? { duration: 0 } : SPRING.smooth}
			onPointerDown={(e) => {
				if ((e.target as HTMLElement).closest("[role=separator]")) setResizing(true);
			}}
			onPointerUp={() => setResizing(false)}
			onPointerCancel={() => setResizing(false)}
			onLostPointerCapture={() => setResizing(false)}
			// Above the dim of the link card (z-30): the rail stays clear.
			className="relative z-(--z-rail) max-w-[40vw] shrink-0 overflow-hidden"
		>
			{sidebarOpen ? (
				<Splitter
					label={t.ui.resize.sidebar}
					value={panel.size}
					min={180}
					max={320}
					invert={navSide === "right"}
					onChange={panel.set}
					onReset={panel.reset}
					scale={scale}
					// The hit area grows 6 px inward, inside the padding of the rail.
					className={
						navSide === "right"
							? "left-0 before:absolute before:inset-y-0 before:left-0 before:-right-1.5"
							: "right-0 before:absolute before:inset-y-0 before:right-0 before:-left-1.5"
					}
				/>
			) : null}
			{sidebar}
		</motion.nav>
	);
	return (
		<div className="flex h-full bg-canvas">
			{navSide === "left" && !bare ? nav : null}
			{drawerSide === "left" ? drawer : null}
			{assistantSide === "left" ? assistant : null}
			{/* The open Ask bar draws inside this element and covers it. */}
			<div data-page-area className="relative flex min-h-0 min-w-0 flex-1 flex-col">
				{contextbar ? (
					<header className="flex shrink-0 flex-wrap items-center gap-4 pt-5 pr-8 pl-4.5">
						{contextbar}
					</header>
				) : null}
				{/* One wrapper in every dock, so a change of dock keeps the shells of `bottom` alive. */}
				<div
					className={cn(
						"flex min-h-0 min-w-0 flex-1",
						bottomDock === "bottom" ? "flex-col" : "flex-row",
					)}
				>
					<main
						aria-label={t.nav.main}
						tabIndex={-1}
						className={cn(
							"min-h-0 min-w-0 flex-1 overflow-auto",
							// shortcut: each page still has its own 16 px side inset (`px-4`), so `main` gives
							// the remainder of the 18 px and 32 px of the design. Move the inset here when the pages lose theirs.
							!bare && "pt-6 pr-4 pb-10 pl-0.5",
						)}
					>
						{main}
					</main>
					{bottom ? (
						<div
							className={cn(
								"flex shrink-0",
								bottomDock === "bottom" && "flex-col",
								bottomDock === "left" && "order-first",
							)}
						>
							{bottom}
						</div>
					) : null}
				</div>
			</div>
			{assistantSide === "right" ? assistant : null}
			{drawerSide === "right" ? drawer : null}
			{inspector}
			{navSide === "right" && !bare ? nav : null}
		</div>
	);
}
