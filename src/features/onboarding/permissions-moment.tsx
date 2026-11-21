import { useQueryClient } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { commands, type OsPermission, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { useActiveProject } from "@/lib/projects";
import { laterPermissions, usePermissionsLater } from "@/lib/shell/permissions-later";
import { Button } from "@/ui/atoms/button";
import { Dialog } from "@/ui/organisms/dialog";
import { askAll, PERMISSIONS_KEY, usePermissions } from "./permissions";
import { useTourOpen } from "./tour-store";

/**
 * The card "Shipyard needs N permissions" (`spec:shell-setup-rights#REQ-010`): the permissions of
 * the system that are missing, each with Allow, with Later and Allow all. The tour shows its own
 * step, so the card waits for it. It never reads the keychain: only Notifications and Files.
 */
export function PermissionsMoment() {
	const { t } = useI18n();
	const m = t.onboarding.permissions;
	const f = t.shellFn.permissions;
	const qc = useQueryClient();
	const hidden = usePermissionsLater();
	const tour = useTourOpen();
	// The first run (role, first project) comes first, like the tour.
	const hasProject = Boolean(useActiveProject().data);
	const list = usePermissions().data ?? [];
	const missing = list.filter((p) => p.state === "notAsked" || p.state === "off");
	const asked = (p: OsPermission) => p.state === "notAsked";
	const allow = async (p: OsPermission) => {
		try {
			const next = await unwrap(commands.permissionsRequest(p.kind));
			qc.setQueryData<OsPermission[]>(PERMISSIONS_KEY, (all) =>
				all?.map((x) => (x.kind === next.kind ? next : x)),
			);
		} catch (e) {
			logError(e);
		}
	};
	return (
		<Dialog
			open={hasProject && !hidden && !tour && missing.length > 0}
			onOpenChange={(open) => {
				if (!open) laterPermissions();
			}}
			title={missing.length === 1 ? f.momentOne : format(f.moment, { count: missing.length })}
			closeLabel={f.later}
			actions={
				missing.some(asked) ? (
					<Button variant="primary" className="min-h-control" onClick={() => void askAll(qc, list)}>
						{m.allowAll}
					</Button>
				) : null
			}
		>
			<ul aria-label={m.title} className="divide-y divide-n-6 rounded-lg border bg-surface-2">
				{missing.map((p) => (
					<li key={p.kind} className="flex items-center gap-3 px-4 py-3 text-ui">
						<span className="mr-auto">{m.kind[p.kind]}</span>
						{asked(p) ? (
							<Button className="min-h-control" onClick={() => void allow(p)}>
								{m.allow}
							</Button>
						) : p.settings ? (
							<Button
								className="min-h-control"
								onClick={() =>
									void unwrap(commands.permissionsOpenSettings(p.kind)).catch(logError)
								}
							>
								{m.settings}
							</Button>
						) : null}
					</li>
				))}
			</ul>
		</Dialog>
	);
}
