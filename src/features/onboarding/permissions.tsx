import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { hiddenSection } from "@/features/shell/places";
import { useI18n } from "@/lib/i18n";
import { commands, type OsPermission, type PermissionState, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { useRights } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { BellIcon, FolderOpenIcon, PlayIcon } from "@/ui/icons";
import { Loading } from "@/ui/molecules/loading";
import { SettingsRow } from "@/ui/molecules/settings-row";
import type { SettingsSection } from "@/ui/templates/settings";
import { openTour } from "./tour-store";

const STATUS: Record<PermissionState, Status> = {
	on: "success",
	off: "danger",
	notAsked: "warning",
	notNeeded: "idle",
	unknown: "info",
};

const KEY = ["os-permissions"];

/** The OS permissions, read again when the window comes back from System Settings. */
export const usePermissions = () =>
	useQuery({
		queryKey: KEY,
		queryFn: () => unwrap(commands.permissionsList()),
		refetchOnWindowFocus: true,
	});

/** The state of one permission and its actions: Allow, Open System Settings, Send a test (REQ-006). */
export function PermissionControl({ permission: p }: { permission: OsPermission }) {
	const { t } = useI18n();
	const m = t.onboarding.permissions;
	const qc = useQueryClient();
	const [busy, setBusy] = useState(false);
	const allow = async () => {
		setBusy(true);
		try {
			const next = await unwrap(commands.permissionsRequest(p.kind));
			qc.setQueryData<OsPermission[]>(KEY, (all) =>
				all?.map((x) => (x.kind === next.kind ? next : x)),
			);
		} catch (e) {
			logError(e);
		} finally {
			setBusy(false);
		}
	};
	const settings = () => unwrap(commands.permissionsOpenSettings(p.kind)).catch(logError);
	const test = () => unwrap(commands.notifyOs("Shipyard", m.testBody)).catch(logError);
	const tests = p.kind === "notifications" && (p.state === "on" || p.state === "unknown");
	return (
		<>
			<span className="flex items-center gap-1.5 text-ui text-n-11">
				<span aria-hidden="true" className="flex">
					<StatusDot status={STATUS[p.state]} />
				</span>
				{m.state[p.state]}
			</span>
			{p.state === "notAsked" ? (
				<Button variant="primary" className="min-h-control" disabled={busy} onClick={allow}>
					{m.allow}
				</Button>
			) : null}
			{tests ? (
				<Button className="min-h-control" onClick={test}>
					{m.test}
				</Button>
			) : null}
			{p.settings && (p.state === "off" || p.state === "unknown") ? (
				<Button className="min-h-control" onClick={settings}>
					{m.settings}
				</Button>
			) : null}
		</>
	);
}

const ICON = { notifications: <BellIcon size={14} />, files: <FolderOpenIcon size={14} /> };

/** The permissions as settings rows, for the tour step. */
export function PermissionList() {
	const { t } = useI18n();
	const { data: list, isLoading } = usePermissions();
	const qc = useQueryClient();
	if (isLoading) return <Loading rows={2} />;
	const open = (list ?? []).filter((p) => p.state === "notAsked");
	// One click asks for each permission that was not asked, one after the other.
	const allowAll = async () => {
		for (const p of open) await unwrap(commands.permissionsRequest(p.kind)).catch(logError);
		await qc.invalidateQueries({ queryKey: KEY });
	};
	return (
		<div className="flex flex-col gap-2">
			<ul aria-label={t.onboarding.permissions.title} className="rounded-lg border bg-surface-2">
				{(list ?? []).map((p) => (
					<li key={p.kind}>
						<SettingsRow icon={ICON[p.kind]} label={t.onboarding.permissions.kind[p.kind]}>
							<PermissionControl permission={p} />
						</SettingsRow>
					</li>
				))}
			</ul>
			{open.length > 1 ? (
				<Button className="min-h-control self-end" onClick={() => void allowAll()}>
					{t.onboarding.permissions.allowAll}
				</Button>
			) : null}
		</div>
	);
}

/**
 * The page that holds the permissions and Replay the tour: This computer, or Me for a role that
 * does not see This computer (`spec:app-redesign#REQ-006`). Each role can reach them.
 */
export function usePermissionsPlace() {
	const { level } = useRights();
	return hiddenSection(level, "setup", "computer") ? "/setup/me" : "/setup/computer";
}

/** The permissions and Replay the tour, as a section of settings (REQ-004, REQ-009). */
export function usePermissionSection(): SettingsSection {
	const { t } = useI18n();
	const m = t.onboarding;
	const list = usePermissions().data ?? [];
	return {
		id: "permissions",
		title: m.permissions.title,
		rows: [
			...list.map((p) => ({
				id: `permission-${p.kind}`,
				icon: ICON[p.kind],
				label: m.permissions.kind[p.kind],
				control: <PermissionControl permission={p} />,
			})),
			{
				id: "tour",
				icon: <PlayIcon size={14} />,
				label: m.tour,
				control: (
					<Button className="min-h-control" onClick={openTour}>
						{m.replay}
					</Button>
				),
			},
		],
	};
}
