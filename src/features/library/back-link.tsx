import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { BackLink } from "@/ui/molecules/back-link";

/** The way back to the doors, in the place of the section switch (`spec:app-redesign#REQ-020`). */
export function LibraryBack() {
	const { t } = useI18n();
	return (
		<div className="flex shrink-0 px-4 pt-3">
			<BackLink label={t.library.back} render={(props) => <Link to="/library/home" {...props} />} />
		</div>
	);
}
