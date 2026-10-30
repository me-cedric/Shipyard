import { type ReactNode, useId, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";
import { CategoryDot, type WorkCategory } from "./ticket-row";

/** The tint of the head and the top line of a column, per category. */
const TONE: Record<
	WorkCategory,
	{ head: string; line: string; badge: "neutral" | "info" | "success" }
> = {
	todo: { head: "bg-n-3", line: "bg-n-8", badge: "neutral" },
	"in-progress": { head: "bg-info-soft", line: "bg-info", badge: "info" },
	done: { head: "bg-success-soft", line: "bg-success", badge: "success" },
};

/** One tracker status with its work-in-progress count. A card dropped here sends its key to `onDropKey`. */
export function BoardColumn({
	title,
	category,
	count,
	onDropKey,
	children,
}: {
	title: string;
	category: WorkCategory;
	count: number;
	onDropKey: (key: string) => void;
	children: ReactNode;
}) {
	const { t } = useI18n();
	const id = useId();
	const [over, setOver] = useState(false);
	const tone = TONE[category];
	return (
		<section
			aria-labelledby={id}
			onDragOver={(e) => {
				e.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setOver(false);
				const key = e.dataTransfer.getData("text/plain");
				if (key) onDropKey(key);
			}}
			className={cn(
				"relative flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1 transition-shadow duration-(--duration-base)",
				over && "shadow-glow",
			)}
		>
			<span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5", tone.line)} />
			<h2
				id={id}
				aria-label={format(t.count, { name: title, count })}
				className={cn(
					"flex min-h-10 shrink-0 items-center gap-2 border-b px-3 text-14 font-medium text-n-12",
					tone.head,
				)}
			>
				<span aria-hidden="true">
					<CategoryDot category={category} label={title} />
				</span>
				<span className="flex-1">{title}</span>
				<Badge variant={tone.badge} className="font-mono">
					{count}
				</Badge>
			</h2>
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">{children}</div>
		</section>
	);
}
