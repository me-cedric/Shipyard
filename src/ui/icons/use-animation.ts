import { useAnimation as useMotionAnimation } from "motion/react";
import { useMemo } from "react";

const reduced = () =>
	typeof window.matchMedia === "function" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Same as motion's `useAnimation`, but `start` does nothing under reduced motion. */
export function useAnimation() {
	const controls = useMotionAnimation();
	return useMemo(() => {
		const start = controls.start.bind(controls);
		controls.start = ((...args: Parameters<typeof start>) =>
			reduced() ? Promise.resolve() : start(...args)) as typeof start;
		return controls;
	}, [controls]);
}
