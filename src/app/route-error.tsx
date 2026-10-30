import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/** A view that failed to load or to render: one plain sentence and a Retry, never the router text. */
export function RouteError({ reset }: ErrorComponentProps) {
	const { t } = useI18n();
	const router = useRouter();
	return (
		<div className="flex flex-col items-start gap-4 p-4">
			<ErrorNotice error={{ code: "unknown", details: t.routeError.message, action: null }} />
			<Button
				onClick={() => {
					reset();
					void router.invalidate();
				}}
			>
				{t.routeError.retry}
			</Button>
		</div>
	);
}
