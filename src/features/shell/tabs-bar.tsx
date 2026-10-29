import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { SPRING } from "@/ui/motion";
import { SPACES, type SpaceId, tabLabel, tabPath } from "./spaces";

/** The tabs of a space as a segmented control. A pill slides under the active tab. */
export function TabsBar({ space }: { space: SpaceId }) {
	const { t } = useI18n();
	return (
		<nav aria-label={t.nav.tabs} className="flex shrink-0 overflow-x-auto px-4 pt-3">
			<div className="flex items-center gap-0.5 rounded-lg border bg-surface-1 p-0.5 shadow-1">
				{SPACES[space].map((tab) => (
					<Link
						key={tab}
						to={tabPath(space, tab)}
						className="relative isolate inline-flex h-7 items-center rounded-md px-2.5 text-ui whitespace-nowrap text-n-11 transition-colors duration-(--duration-fast) hover:text-n-12 aria-[current=page]:text-n-12"
					>
						{({ isActive }) => (
							<>
								{isActive ? (
									<motion.span
										layoutId={`tab-pill-${space}`}
										transition={SPRING.smooth}
										className="absolute inset-0 -z-10 rounded-md bg-surface-3 shadow-1 ring-1 ring-n-6"
									/>
								) : null}
								{tabLabel(t, space, tab)}
							</>
						)}
					</Link>
				))}
			</div>
		</nav>
	);
}
