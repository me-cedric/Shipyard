import { useI18n } from "@/lib/i18n";
import { EmptyState } from "@/ui/molecules/empty-state";

export function Inbox() {
	const { t } = useI18n();
	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-14 font-medium">{t.home.needsYou}</h1>
			{/* Placeholder: the Inbox content comes with `add-questions-loop`. */}
			<EmptyState action={{ label: t.noun.home, onClick: () => {} }} />
		</div>
	);
}
