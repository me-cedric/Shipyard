import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { ReactElement } from "react";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { IconButton } from "@/ui/atoms/icon-button";
import { Tooltip } from "@/ui/atoms/tooltip";
import { ChevronLeftIcon, ChevronRightIcon } from "@/ui/icons";
import { SPRING } from "@/ui/motion";
import logo from "../../../docs/assets/logo.svg";
import { type Action, SPACE_ICON, shortcutText } from "./actions";
import { useCounts } from "./counts";
import { orderedSpaces } from "./spaces";

export function Sidebar({ toggle }: { toggle: Action }) {
	const { t } = useI18n();
	const { role, sidebarOpen } = usePrefs();
	const { badge } = useCounts();
	const entries = orderedSpaces(role).map((space, i) => {
		const Icon = SPACE_ICON[space];
		const name = t.space[space];
		const count = badge[space] ?? 0;
		const link: ReactElement<Record<string, unknown>> = (
			<Link
				to={`/${space}` as const}
				className="relative isolate flex h-8 items-center gap-3 rounded-md px-2.5 text-ui text-n-11 transition-colors duration-(--duration-fast) not-aria-[current=page]:hover:bg-n-3 not-aria-[current=page]:hover:text-n-12 aria-[current=page]:text-accent-fg"
			>
				{({ isActive }) => (
					<>
						{isActive ? (
							<motion.span
								layoutId="space-pill"
								transition={SPRING.smooth}
								className="absolute inset-0 -z-10 rounded-md bg-accent-gradient shadow-glow"
							/>
						) : null}
						<Icon size={16} />
						{/* The rail keeps the name for assistive tools: the count stays out of the name. */}
						<span className={sidebarOpen ? "flex-1 truncate" : "sr-only"}>{name}</span>
						{count ? (
							<span
								// The context bar names each of these counts for assistive tools.
								aria-hidden="true"
								className={cn(
									"rounded-full font-mono text-11",
									sidebarOpen
										? "px-1.5 text-n-11"
										: "absolute top-0 right-0 h-3.5 min-w-3.5 bg-accent px-1 text-center leading-3.5 text-accent-fg",
									isActive && "text-accent-fg",
								)}
							>
								{count}
							</span>
						) : null}
					</>
				)}
			</Link>
		);
		return (
			<li key={space} className={space === "settings" ? "mt-auto" : undefined}>
				{sidebarOpen ? (
					link
				) : (
					<Tooltip label={name} shortcut={shortcutText(String(i + 1))}>
						{link}
					</Tooltip>
				)}
			</li>
		);
	});
	return (
		<div className="flex h-full flex-col gap-1 p-2">
			<div className="flex h-8 items-center px-1.5">
				<img src={logo} alt="Shipyard" className="size-6 shrink-0" />
			</div>
			<ul className="flex min-h-0 flex-1 flex-col gap-0.5">{entries}</ul>
			<IconButton
				label={sidebarOpen ? t.nav.collapse : t.nav.expand}
				shortcut={toggle.shortcut}
				onClick={toggle.run}
				className="h-8 w-full"
			>
				{sidebarOpen ? <ChevronLeftIcon size={16} /> : <ChevronRightIcon size={16} />}
			</IconButton>
		</div>
	);
}
