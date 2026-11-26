import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { PageHeader } from "@/ui/molecules/page-header";

export function NotFound() {
	const { t } = useI18n();
	const navigate = useNavigate();
	return (
		<div className="flex flex-col gap-4">
			<PageHeader title={t.notFound.title} />
			<div className="flex justify-center py-10">
				<Button variant="primary" onClick={() => navigate({ to: "/" })}>
					{t.doctor.auto.today}
				</Button>
			</div>
		</div>
	);
}
