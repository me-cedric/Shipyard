import { useAnimation as useMotionAnimation } from "motion/react";
import { useMemo, useRef } from "react";
import { useReducedMotionPref } from "../motion";

/** Same as motion's `useAnimation`, but `start` does nothing under reduced motion. */
export function useAnimation() {
	const controls = useMotionAnimation();
	const reduced = useRef(false);
	reduced.current = useReducedMotionPref();
	return useMemo(() => {
		const start = controls.start.bind(controls);
		controls.start = ((...args: Parameters<typeof start>) =>
			reduced.current ? Promise.resolve() : start(...args)) as typeof start;
		return controls;
	}, [controls]);
}
