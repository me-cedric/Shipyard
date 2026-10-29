import { useAnimate, useReducedMotion } from "motion/react";
import { type ComponentType, type Ref, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type IconHandle = { startAnimation: () => void; stopAnimation: () => void };

/**
 * An icon that moves on hover and on a change of state: `spin` turns it while a task runs (sync),
 * `ring` shakes it once each time the number grows (bell), `play` replays its own stroke once each
 * time the value changes (a check that draws). Reduced motion keeps it still.
 */
export function AnimatedIcon({
	icon: Icon,
	size = 16,
	spin,
	ring,
	play,
	className,
}: {
	icon: ComponentType<{ size?: number; ref?: Ref<IconHandle> }>;
	size?: number;
	spin?: boolean;
	ring?: number;
	play?: unknown;
	className?: string;
}) {
	const handle = useRef<IconHandle>(null);
	const [scope, animate] = useAnimate<HTMLSpanElement>();
	const reduce = useReducedMotion();
	const rung = useRef(ring);
	const played = useRef(play);
	useEffect(() => {
		const grew = ring !== undefined && rung.current !== undefined && ring > rung.current;
		rung.current = ring;
		if (grew && !reduce)
			void animate(scope.current, { rotate: [0, -16, 13, -9, 5, 0] }, { duration: 0.7 });
	}, [ring, reduce, animate, scope]);
	useEffect(() => {
		if (played.current === play) return;
		played.current = play;
		handle.current?.startAnimation();
	}, [play]);
	return (
		<span
			ref={scope}
			aria-hidden="true"
			onMouseEnter={() => handle.current?.startAnimation()}
			onMouseLeave={() => handle.current?.stopAnimation()}
			className={cn("inline-flex shrink-0 origin-top", spin && "animate-spin", className)}
		>
			<Icon size={size} ref={handle} />
		</span>
	);
}
