import { type ReactNode, useId } from "react";
import { format, useI18n } from "@/lib/i18n";
import { CategoryDot, type WorkCategory } from "./ticket-row";

/** One tracker status. A card dropped here sends its key to `onDropKey`. */
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
	return (
		<section
			aria-labelledby={id}
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				const key = e.dataTransfer.getData("text/plain");
				if (key) onDropKey(key);
			}}
			className="flex w-64 shrink-0 flex-col rounded-md bg-n-2"
		>
			<h2 id={id} className="flex h-row items-center gap-2 px-2 text-12 font-medium text-n-11">
				<span aria-hidden="true">
					<CategoryDot category={category} label={title} />
				</span>
				{format(t.count, { name: title, count })}
			</h2>
			<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1">{children}</div>
		</section>
	);
}
