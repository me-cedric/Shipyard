import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ScopePicker } from "@/features/projects/scope-picker";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { projectKeys } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SettingsRow } from "@/ui/molecules/settings-row";

/**
 * The step after a tracker connection passes its test: pick the tracker project from the list that the
 * tracker gives. It shows only when the list has items and the project names no scope yet.
 */
export function ScopeStep({ tracker, onDone }: { tracker: string; onDone: () => void }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [scope, setScope] = useState("");
	const [error, setError] = useState<unknown>(null);
	const scopes = useQuery({
		queryKey: ["connections", "scopes", tracker],
		queryFn: () => unwrap(commands.connectionsScopes(tracker)),
		retry: false,
	});
	const settings = useQuery({
		queryKey: projectKeys.settings,
		queryFn: () => unwrap(commands.projectSettings()),
	});
	const file = settings.data?.file ?? null;
	const skip =
		(scopes.isSuccess && scopes.data.length === 0) ||
		scopes.isError ||
		(settings.isSuccess && (!file || Boolean(file.connections?.trackerScope)));
	useEffect(() => {
		if (skip) onDone();
	}, [skip, onDone]);
	if (skip || !scopes.isSuccess || !file) return null;
	const save = async () => {
		try {
			setError(null);
			await unwrap(
				commands.projectFileSave({
					...file,
					connections: {
						tracker: file.connections?.tracker ?? tracker,
						forge: file.connections?.forge ?? null,
						trackerScope: scope.trim() || null,
					},
				}),
			);
			await qc.invalidateQueries();
			onDone();
		} catch (e) {
			setError(e);
		}
	};
	return (
		<div className="flex flex-col border-b">
			<SettingsRow label={t.projects.trackerScope}>
				<ScopePicker tracker={tracker} value={scope} onChange={setScope} />
			</SettingsRow>
			<ErrorNotice error={error} className="px-3 pt-2" />
			<div className="flex gap-2 px-3 py-2">
				<Button variant="primary" disabled={!scope} onClick={() => void save()}>
					{t.projects.save}
				</Button>
				<Button variant="ghost" onClick={onDone}>
					{t.common.close}
				</Button>
			</div>
		</div>
	);
}
