import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, type OsPermission, type PermissionState, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { Button } from "@/ui/atoms/button";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { BellIcon, FolderOpenIcon, PlayIcon } from "@/ui/icons";
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
				<Button variant="primary" disabled={busy} onClick={allow}>
					{m.allow}
				</Button>
			) : null}
			{tests ? <Button onClick={test}>{m.test}</Button> : null}
			{p.settings && (p.state === "off" || p.state === "unknown") ? (
				<Button onClick={settings}>{m.settings}</Button>
			) : null}
		</>
	);
}

const ICON = { notifications: <BellIcon size={14} />, files: <FolderOpenIcon size={14} /> };

/** The permissions as settings rows, for the tour step. */
export function PermissionList() {
	const { t } = useI18n();
	const list = usePermissions().data ?? [];
	return (
		<ul aria-label={t.onboarding.permissions.title} className="rounded-lg border bg-surface-2">
			{list.map((p) => (
				<li key={p.kind}>
					<SettingsRow icon={ICON[p.kind]} label={t.onboarding.permissions.kind[p.kind]}>
						<PermissionControl permission={p} />
					</SettingsRow>
				</li>
			))}
		</ul>
	);
}

/** Settings / Me: the permissions and Replay the tour (REQ-004, REQ-009). */
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
				control: <Button onClick={openTour}>{m.replay}</Button>,
			},
		],
	};
}
