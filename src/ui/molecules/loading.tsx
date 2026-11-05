import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "../atoms/skeleton";
import { PageHeader } from "./page-header";

/**
 * Skeleton rows that pulse while a page loads. The pulse stops with reduced motion. With a `title`
 * the head of the page shows above the rows, so the page keeps its name while it loads.
 */
export function Loading({
	rows = 6,
	title,
	icon,
}: {
	rows?: number;
	title?: string;
	icon?: ReactNode;
}) {
	const { t } = useI18n();
	return (
		<>
			{title ? <PageHeader icon={icon} title={title} /> : null}
			<div role="status" aria-label={t.common.loading} className="flex flex-col gap-3 p-4">
				{Array.from({ length: rows }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: the rows are identical and never reorder
					<Skeleton key={i} className="h-8 w-full motion-safe:animate-status-pulse" />
				))}
			</div>
		</>
	);
}
