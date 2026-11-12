import { animate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotionPref } from "@/ui/motion";

/** A number that counts from its last value to the new one. The last frame is the exact value. */
export function CountUp({
	value,
	format = (n) => Math.round(n).toLocaleString(),
	className,
}: {
	value: number;
	format?: (n: number) => string;
	className?: string;
}) {
	const reduce = useReducedMotionPref();
	const [shown, setShown] = useState(value);
	const from = useRef(value);
	useEffect(() => {
		const set = (n: number) => {
			from.current = n;
			setShown(n);
		};
		if (reduce) return set(value);
		const a = animate(from.current, value, {
			duration: 0.6,
			ease: "easeOut",
			onUpdate: set,
			onComplete: () => set(value),
		});
		return () => a.stop();
	}, [value, reduce]);
	return <span className={cn("tabular-nums", className)}>{format(shown)}</span>;
}
