import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

/** Sidebar is 48 px collapsed or 220 px open. */
export function Shell({
	sidebar,
	main,
	inspector,
	statusbar,
	sidebarOpen = true,
}: {
	sidebar: ReactNode;
	main: ReactNode;
	inspector?: ReactNode;
	statusbar?: ReactNode;
	sidebarOpen?: boolean;
}) {
	const { t } = useI18n();
	return (
		<div className="flex h-full flex-col bg-n-1">
			<div className="flex min-h-0 flex-1">
				<nav
					aria-label={t.nav.sidebar}
					data-open={sidebarOpen}
					className="shrink-0 overflow-hidden border-r transition-[width] duration-(--duration-base) ease-standard data-[open=false]:w-12 data-[open=true]:w-55"
				>
					{sidebar}
				</nav>
				<main
					aria-label={t.nav.main}
					tabIndex={-1}
					className="min-w-0 flex-1 overflow-auto focus:outline-none"
				>
					{main}
				</main>
				{inspector}
			</div>
			{statusbar ? (
				<footer className="flex h-6 items-center gap-3 border-t px-3 text-11 text-n-11">
					{statusbar}
				</footer>
			) : null}
		</div>
	);
}
