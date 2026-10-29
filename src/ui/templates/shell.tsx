import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

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
}) {
	const { t } = useI18n();
	return (
		<div className="flex h-full flex-col bg-surface-0">
			{contextbar ? (
				<header className="flex h-11 shrink-0 items-center gap-2 border-b bg-surface-1 px-2">
					{contextbar}
				</header>
			) : null}
			<div className="flex min-h-0 flex-1 bg-canvas">
				<nav
					aria-label={t.nav.sidebar}
					data-open={sidebarOpen}
					className="z-10 my-2 ml-2 shrink-0 overflow-hidden rounded-lg border bg-surface-1 shadow-1 transition-[width] duration-(--duration-base) ease-standard data-[open=false]:w-14 data-[open=true]:w-55"
				>
					{sidebar}
				</nav>
				{assistantSide === "left" ? assistant : null}
				<main
					aria-label={t.nav.main}
					tabIndex={-1}
					className="min-w-0 flex-1 overflow-auto focus:outline-none"
				>
					{main}
				</main>
				{assistantSide === "right" ? assistant : null}
				{inspector}
			</div>
			{statusbar ? (
				<footer className="flex h-5 shrink-0 items-center gap-3 border-t bg-surface-1 px-3 text-11 text-n-11">
					{statusbar}
				</footer>
			) : null}
		</div>
	);
}
