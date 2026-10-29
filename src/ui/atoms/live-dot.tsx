import { cn } from "@/lib/utils";

/**
 * A breathing dot for a live agent: the one loop of the interface. Still under reduced motion.
 * Without a label it is decoration: the text next to it names the state.
 */
export function LiveDot({ label, className }: { label?: string; className?: string }) {
	const dot = cn("inline-block size-2 shrink-0 animate-live rounded-full bg-accent", className);
	return label ? (
		<span role="img" aria-label={label} className={dot} />
	) : (
		<span aria-hidden="true" className={dot} />
	);
}
