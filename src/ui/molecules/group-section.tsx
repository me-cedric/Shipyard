import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";

/** A list group: the heading shows the name and the count. */
export function GroupSection({
	name,
	count,
	children,
}: {
	name: string;
	count: number;
	children: ReactNode;
}) {
	const { t } = useI18n();
	return (
		<section aria-label={name}>
			<h2 className="flex h-8 items-center gap-2 px-3 pt-2 text-12 font-medium text-n-11">
				{format(t.count, { name, count })}
			</h2>
			{children}
		</section>
	);
}
