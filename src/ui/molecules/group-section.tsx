import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";

/** A list group: the heading shows the name and the count. */
export function GroupSection({
	id,
	name,
	count,
	children,
}: {
	/** The anchor of the group: a section list can link to it. */
	id?: string;
	name: string;
	count: number;
	children: ReactNode;
}) {
	const { t } = useI18n();
	return (
		<section id={id} aria-label={name}>
			<h2 className="flex h-8 items-center gap-2 px-3 pt-2 text-12 font-medium text-n-11">
				{format(t.count, { name, count })}
			</h2>
			{children}
		</section>
	);
}
