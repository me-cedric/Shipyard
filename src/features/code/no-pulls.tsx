import { useNavigate } from "@tanstack/react-router";
import { usePullsStatus } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { askForm } from "@/lib/shell";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/**
 * The page has no pull request. A code host that fails shows its error and its action. A code host
 * that works offers a new pull request. No code host offers Connect: Settings / Connections opens on
 * the code host form.
 */
export function NoPulls({ onNew }: { onNew: () => void }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const query = usePullsStatus();
	const status = query.data;
	if (query.error) return <ErrorNotice error={query.error} className="px-4 pt-3" />;
	if (!status) return null;
	if (status.error) return <ErrorNotice error={status.error} className="px-4 pt-3" />;
	return (
		<EmptyState
			action={
				status.connected
					? { label: t.forge.newPull, onClick: onNew }
					: {
							label: t.forge.connect,
							onClick: () => {
								askForm("connection:forge");
								void navigate({ to: "/settings/connections" });
							},
						}
			}
		/>
	);
}
