import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { ChevronLeftIcon } from "@/ui/icons";

/** The way back to the doors, in the place of the section switch (`spec:app-redesign#REQ-020`). */
export function LibraryBack() {
	const { t } = useI18n();
	return (
		<div className="flex shrink-0 px-4 pt-3">
			<Link
				to="/library/home"
				className="inline-flex min-h-control items-center gap-1 text-14 font-medium text-accent-text"
			>
				<ChevronLeftIcon size={16} />
				{t.library.back}
			</Link>
		</div>
	);
}
