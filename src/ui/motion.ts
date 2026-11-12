import { type Transition, useReducedMotionConfig, type Variants } from "motion/react";

/** The three springs of visual language v2 (ADR 0014). */
export const SPRING = {
	/** Hover and press. */
	snappy: { type: "spring", stiffness: 500, damping: 32 },
	/** Panels, pills and lists. */
	smooth: { type: "spring", stiffness: 300, damping: 30 },
	/** A change of page. */
	gentle: { type: "spring", stiffness: 180, damping: 24 },
} as const satisfies Record<string, Transition>;

/** The duration tokens of tokens.css in ms, for a library that takes numbers. */
export const DURATION = { fast: 120, base: 200 } as const;

/** A list staggers its items by 20 ms. Only the position moves, so a list never hides its text. */
export const LIST: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.02 } } };
export const ITEM: Variants = {
	hidden: { y: 6 },
	shown: { y: 0, transition: SPRING.smooth },
};

/** True when the OS or the motion preference of the person asks for reduced motion. It follows the `MotionConfig` of the app. */
export function useReducedMotionPref() {
	return !!useReducedMotionConfig();
}

/** False under reduced motion: pass it as `initial` so nothing moves on mount. */
export function useEnter() {
	return useReducedMotionPref() ? false : "hidden";
}

/** The same answer as `useReducedMotionPref`, for code outside React: the OS setting or the root attribute of the preference. */
export function prefersReducedMotion() {
	return (
		document.documentElement.dataset.motion === "reduce" ||
		(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)
	);
}
