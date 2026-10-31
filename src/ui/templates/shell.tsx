import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
	/** The side of the sidebar. */
	navSide?: "left" | "right";
	/** The side of `drawer`. */
	drawerSide?: "left" | "right";
	/** A lower context bar. */
	narrow?: boolean;
}) {
	const { t } = useI18n();
	const nav = (
		<nav
			aria-label={t.nav.sidebar}
			data-open={sidebarOpen}
			className={cn(
				"z-10 my-2 shrink-0 overflow-hidden rounded-lg border bg-surface-1 shadow-1 transition-[width] duration-(--duration-base) ease-standard data-[open=false]:w-14 data-[open=true]:w-55",
				navSide === "right" ? "mr-2" : "ml-2",
			)}
		>
			{sidebar}
		</nav>
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
				<main
					aria-label={t.nav.main}
					tabIndex={-1}
					className="min-w-0 flex-1 overflow-auto focus:outline-none"
				>
					{main}
				</main>
				{assistantSide === "right" ? assistant : null}
				{drawerSide === "right" ? drawer : null}
				{inspector}
				{navSide === "right" ? nav : null}
			</div>
			{bottom ? <div className="flex shrink-0 flex-col bg-canvas">{bottom}</div> : null}
			{statusbar ? (
				<footer className="flex h-5 shrink-0 items-center gap-3 border-t bg-surface-1 px-3 text-11 text-n-11">
					{statusbar}
				</footer>
			) : null}
		</div>
	);
}
