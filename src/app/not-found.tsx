import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { EmptyState } from "@/ui/molecules/empty-state";

export function NotFound() {
	const { t } = useI18n();
	const navigate = useNavigate();
	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="text-14 font-medium">{t.notFound.title}</h1>
			<EmptyState action={{ label: t.notFound.home, onClick: () => navigate({ to: "/" }) }} />
		</div>
	);
}
