import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { SPRING } from "@/ui/motion";
import { StaleBadge, useStalePages } from "../specs/chain-badge";
import { type SpaceId, tabLabel, tabPath, visibleTabs } from "./spaces";

/** The tabs of a space as a segmented control. A pill slides under the active tab. */
export function TabsBar({ space }: { space: SpaceId }) {
	const { t } = useI18n();
	const { profile, role } = usePrefs();
	const stale = useStalePages();
	return (
		<nav aria-label={t.nav.tabs} className="flex shrink-0 px-4 pt-3">
			{/* The tabs wrap when the assistant and the inspector leave little width: none is cut off. */}
			<div className="flex flex-wrap items-center gap-0.5 rounded-lg border bg-surface-1 p-0.5 shadow-1">
				{visibleTabs(space, profile.hiddenTabs, role).map((tab) => (
					<Link
						key={tab}
						to={tabPath(space, tab)}
						// A pointer that rests on a tab loads its code before the click.
						preload="intent"
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
								{stale.has(`${space}/${tab}`) ? <StaleBadge /> : null}
							</>
						)}
					</Link>
				))}
			</div>
		</nav>
	);
}
