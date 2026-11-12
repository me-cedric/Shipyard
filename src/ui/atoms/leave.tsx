import { motion, useIsPresent } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { SPRING, useReducedMotionPref } from "../motion";

const FOCUSABLE = "button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

/** Moves the focus off a row that leaves: to the next row that stays, else the previous one, else the list. */
function keepFocus(row: HTMLElement) {
	if (!row.contains(document.activeElement)) return;
	for (const side of ["nextElementSibling", "previousElementSibling"] as const) {
		for (let s = row[side]; s; s = s[side]) {
			const target = s.hasAttribute("inert") ? null : s.querySelector<HTMLElement>(FOCUSABLE);
			if (target) return target.focus();
		}
	}
	row.parentElement?.closest<HTMLElement>("[tabindex]")?.focus();
}

/**
 * A row of a list that a person removes. It leaves in height and opacity. Put it under
 * `<AnimatePresence initial={false}>` with a stable key, and keep that list mounted until the last row
 * has left (the empty text goes beside it). Under reduced motion it goes at once.
 */
export function Leave({
	as = "div",
	className,
	children,
}: {
	as?: "div" | "li";
	className?: string;
	children: ReactNode;
}) {
	const still = useReducedMotionPref();
	const present = useIsPresent();
	const ref = useRef<HTMLElement>(null);
	// Before paint: the browser drops the focus of an inert row after it.
	useLayoutEffect(() => {
		if (!present && ref.current) keepFocus(ref.current);
	}, [present]);
	const Tag = motion[as];
	return (
		<Tag
			ref={ref as never}
			className={className}
			// A leaving row takes no click, no Tab stop and is not read again.
			inert={!present}
			exit={{ height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}
			transition={still ? { duration: 0 } : SPRING.smooth}
		>
			{children}
		</Tag>
	);
}
