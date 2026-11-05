import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/** A row of links to the sections of a page. It stays at the top of the scroll area. */
export function SectionNav({
	label,
	items,
}: {
	label: string;
	items: { id: string; label: string; icon: ReactNode }[];
}) {
	const reduced = useReducedMotion();
	const nav = useRef<HTMLElement>(null);
	// Only the sections on the page: a panel with no data renders nothing, so its link would do nothing.
	const ids = items.map((i) => i.id).join(" ");
	const [present, setPresent] = useState("");
	useEffect(() => {
		const check = () =>
			setPresent(
				ids
					.split(" ")
					.filter((id) => document.getElementById(id))
					.join(" "),
			);
		check();
		const watch = new MutationObserver(check);
		// The page around the bar: its sections appear when their data loads.
		watch.observe(nav.current?.parentElement ?? document.body, { childList: true, subtree: true });
		return () => watch.disconnect();
	}, [ids]);
	const shown = items.filter((i) => present.split(" ").includes(i.id));
	const jump = (e: React.MouseEvent, id: string) => {
		e.preventDefault();
		const target = document.getElementById(id);
		// A section inside a closed <details> must open first.
		const details = target?.closest("details");
		if (details) details.open = true;
		// The heading stops below this bar, not under it.
		if (target) target.style.scrollMarginTop = `${(nav.current?.offsetHeight ?? 0) + 8}px`;
		target?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
		// The keyboard goes on from the section, not from the bar.
		if (target && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
		target?.focus({ preventScroll: true });
	};
	return (
		<nav
			ref={nav}
			hidden={shown.length === 0}
			aria-label={label}
			className="sticky top-0 z-10 border-b bg-surface-1"
		>
			<ul className="flex gap-1 overflow-x-auto px-4 py-1">
				{shown.map((i) => (
					<li key={i.id} className="shrink-0">
						<a
							href={`#${i.id}`}
							onClick={(e) => jump(e, i.id)}
							className="flex h-row items-center gap-2 rounded-md px-2 text-12 text-n-11 hover:bg-n-3 hover:text-n-12 focus-visible:ring-2 focus-visible:ring-accent"
						>
							<span aria-hidden="true" className="flex">
								{i.icon}
							</span>
							{i.label}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
