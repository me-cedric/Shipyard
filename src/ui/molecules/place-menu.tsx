import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LiveDot } from "../atoms/live-dot";

export type Place = {
	id: string;
	label: string;
	icon: ReactNode;
	count?: number;
	/** A dot with this spoken text, for news that has no number here. */
	alert?: string;
	/** A breathing dot with this spoken text, while an agent works. */
	live?: string;
	current?: boolean;
};
export type PlaceLinkProps = {
	className: string;
	"aria-current": "page" | undefined;
	children: ReactNode;
};

const LINK =
	"relative flex min-h-control items-center gap-3 rounded-lg px-3 text-14 text-n-11 transition-colors duration-(--duration-fast) hover:text-n-12";

/** A vertical menu of places. The caller draws the link, so this layer knows no router. */
export function PlaceMenu({
	label,
	items,
	end,
	narrow,
	renderLink = (p, props) => (
		<a href={`#${p.id}`} {...props}>
			{props.children}
		</a>
	),
}: {
	label?: string;
	items: Place[];
	/** The last entry, set apart at the foot of the menu. */
	end?: Place;
	/** Icons only. The names stay for assistive tools. */
	narrow?: boolean;
	renderLink?: (place: Place, props: PlaceLinkProps) => ReactNode;
}) {
	const { t } = useI18n();
	const entry = (p: Place, className?: string) => (
		<li key={p.id} className={className}>
			{renderLink(p, {
				className: cn(LINK, p.current && "bg-surface-2 text-n-12 shadow-1"),
				"aria-current": p.current ? "page" : undefined,
				children: (
					<>
						<span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center">
							{p.icon}
						</span>
						<span className={cn("min-w-0 flex-1 truncate", narrow && "sr-only")}>{p.label}</span>
						{p.live ? (
							<>
								<LiveDot />
								<span className="sr-only"> {p.live}</span>
							</>
						) : null}
						{p.alert ? (
							<>
								<span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />
								<span className="sr-only"> {p.alert}</span>
							</>
						) : null}
						{p.count !== undefined ? (
							<>
								{" "}
								<span
									className={cn(
										"tabular-nums",
										narrow
											? "absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-11 text-accent-fg"
											: "text-12",
									)}
								>
									{p.count}
								</span>
							</>
						) : null}
					</>
				),
			})}
		</li>
	);
	return (
		<nav aria-label={label ?? t.ui.places} className="flex h-full flex-col">
			<ul className="flex flex-1 flex-col gap-1">
				{items.map((p) => entry(p))}
				{end ? entry(end, "mt-auto") : null}
			</ul>
		</nav>
	);
}
