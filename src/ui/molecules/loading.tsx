import { useI18n } from "@/lib/i18n";
import { Skeleton } from "../atoms/skeleton";

/** Skeleton rows that pulse while a page loads. The pulse stops with reduced motion. */
export function Loading({ rows = 6 }: { rows?: number }) {
	const { t } = useI18n();
	return (
		<div role="status" aria-label={t.common.loading} className="flex flex-col gap-3 p-4">
			{Array.from({ length: rows }, (_, i) => (
				<Skeleton
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
					key={i}
					className="h-8 w-full motion-safe:animate-status-pulse"
				/>
			))}
		</div>
	);
}
