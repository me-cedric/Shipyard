import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { SPACES, type SpaceId, tabLabel, tabPath } from "./spaces";

export function TabsBar({ space, trailing }: { space: SpaceId; trailing?: ReactNode }) {
	const { t } = useI18n();
	return (
		<nav
			aria-label={t.nav.tabs}
			className="flex h-9 items-center gap-1 overflow-x-auto border-b px-2"
		>
			{SPACES[space].map((tab) => (
				<Link
					key={tab}
					to={tabPath(space, tab)}
					className="inline-flex h-row items-center rounded-md px-2 text-ui whitespace-nowrap text-n-11 hover:bg-n-3 hover:text-n-12 aria-[current=page]:bg-n-4 aria-[current=page]:text-n-12"
				>
					{tabLabel(t, space, tab)}
				</Link>
			))}
			{trailing ? (
				<>
					<span className="flex-1" />
					{trailing}
				</>
			) : null}
		</nav>
	);
}
