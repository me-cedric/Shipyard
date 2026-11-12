import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePanelSize } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { Splitter } from "../molecules/splitter";
import { SPRING, useReducedMotionPref } from "../motion";

/** A context bar on top, a floating sidebar (56 px rail or 220 px open), the main canvas and a status bar. */
export function Shell({
	contextbar,
	sidebar,
	main,
	inspector,
	statusbar,
	sidebarOpen = true,
	assistant,
	assistantSide = "right",
	drawer,
	bottom,
	bottomDock = "bottom",
	navSide = "left",
	drawerSide = "left",
	narrow = false,
}: {
	/** The bar of the project, the branch, the factory pulse and the global actions. */
	contextbar?: ReactNode;
	sidebar: ReactNode;
	main: ReactNode;
	inspector?: ReactNode;
	statusbar?: ReactNode;
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
	/** A lower context bar. */
	narrow?: boolean;
}) {
	const { t } = useI18n();
	const panel = usePanelSize("sidebar-width", 220);
	const [resizing, setResizing] = useState(false);
	const still = useReducedMotionPref();
	const nav = (
		<motion.nav
			aria-label={t.nav.sidebar}
			data-open={sidebarOpen}
			initial={false}
			animate={{ width: sidebarOpen ? panel.size : 56 }}
			// A drag follows the pointer at once.
			transition={resizing || still ? { duration: 0 } : SPRING.smooth}
			onPointerDown={(e) => {
				if ((e.target as HTMLElement).closest("[role=separator]")) setResizing(true);
			}}
			onPointerUp={() => setResizing(false)}
			onPointerCancel={() => setResizing(false)}
			onLostPointerCapture={() => setResizing(false)}
			className={cn(
				"relative z-10 my-2 max-w-[40vw] shrink-0 overflow-hidden rounded-lg border bg-surface-1 shadow-1",
				navSide === "right" ? "mr-2" : "ml-2",
			)}
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
					className={navSide === "right" ? "left-0" : "right-0"}
				/>
			) : null}
			{sidebar}
		</motion.nav>
	);
	return (
		<div className="flex h-full flex-col bg-surface-0">
			{contextbar ? (
				<header
					className={cn(
						"flex shrink-0 items-center gap-2 border-b bg-surface-1 px-2",
						narrow ? "h-9" : "h-11",
					)}
				>
					{contextbar}
				</header>
			) : null}
			<div className="flex min-h-0 flex-1 bg-canvas">
				{navSide === "left" ? nav : null}
				{drawerSide === "left" ? drawer : null}
				{assistantSide === "left" ? assistant : null}
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
						className="min-h-0 min-w-0 flex-1 overflow-auto"
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
				{assistantSide === "right" ? assistant : null}
				{drawerSide === "right" ? drawer : null}
				{inspector}
				{navSide === "right" ? nav : null}
			</div>
			{statusbar ? (
				<footer className="flex h-5 shrink-0 items-center gap-3 border-t bg-surface-1 px-3 text-11 text-n-11">
					{statusbar}
				</footer>
			) : null}
		</div>
	);
}
