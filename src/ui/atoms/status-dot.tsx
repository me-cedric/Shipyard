import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type Status = "success" | "warning" | "danger" | "info" | "active" | "idle";

/** One shape and one colour per status. `active` loops a pulse (static under reduced motion). */
const SHAPES: Record<Status, { shape: string; color: string; node: React.ReactNode }> = {
	success: {
		shape: "circle",
		color: "text-success",
		node: <circle cx="5" cy="5" r="4" fill="currentColor" />,
	},
	warning: {
		shape: "triangle",
		color: "text-warning",
		node: <polygon points="5,1 9.5,9 0.5,9" fill="currentColor" />,
	},
	danger: {
		shape: "diamond",
		color: "text-danger",
		node: <polygon points="5,0.5 9.5,5 5,9.5 0.5,5" fill="currentColor" />,
	},
	info: {
		shape: "ring",
		color: "text-info",
		node: <circle cx="5" cy="5" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" />,
	},
	active: {
		shape: "target",
		color: "text-accent",
		node: (
			<>
				<circle cx="5" cy="5" r="4.25" fill="none" stroke="currentColor" strokeWidth="1" />
				<circle cx="5" cy="5" r="2" fill="currentColor" />
			</>
		),
	},
	idle: {
		shape: "dash",
		color: "text-n-9",
		node: <rect x="1" y="4" width="8" height="2" fill="currentColor" />,
	},
};

export function StatusDot({ status, className }: { status: Status; className?: string }) {
	const { t } = useI18n();
	const s = SHAPES[status];
	return (
		<svg
			role="img"
			aria-label={t.status[status]}
			data-shape={s.shape}
			viewBox="0 0 10 10"
			className={cn(
				"size-2.5 shrink-0",
				s.color,
				status === "active" && "animate-status-pulse",
				className,
			)}
		>
			{s.node}
		</svg>
	);
}
