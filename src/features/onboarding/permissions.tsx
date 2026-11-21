import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Fold } from "@/features/settings/connections/fold";
import { SetupCard, SetupRow, StatePill } from "@/features/settings/parts";
import { hiddenSection } from "@/features/shell/places";
import { useI18n } from "@/lib/i18n";
import { commands, type OsPermission, type PermissionState, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { useRights } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { BellIcon, FolderOpenIcon } from "@/ui/icons";
import { Loading } from "@/ui/molecules/loading";
import { Row } from "@/ui/molecules/row";
import { TourRow } from "./tour-row";
import { openTour } from "./tour-store";

/** The pill of each state: on, to fix by the person, or nothing to do. */
const PILL: Record<PermissionState, "ready" | "fix" | "off"> = {
	on: "ready",
	off: "fix",
	notAsked: "fix",
	notNeeded: "off",
	unknown: "off",
};

export const PERMISSIONS_KEY = ["os-permissions"];
const KEY = PERMISSIONS_KEY;

/** The OS permissions, read again when the window comes back from System Settings. */
export const usePermissions = () =>
	useQuery({
		queryKey: KEY,
		queryFn: () => unwrap(commands.permissionsList()),
		refetchOnWindowFocus: true,
	});

/** One click asks for each permission that was not asked, one after the other. */
export async function askAll(qc: QueryClient, list: OsPermission[]) {
	for (const p of list)
		if (p.state === "notAsked") await unwrap(commands.permissionsRequest(p.kind)).catch(logError);
	await qc.invalidateQueries({ queryKey: PERMISSIONS_KEY });
}

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
			<StatePill state={PILL[p.state]}>{m.state[p.state]}</StatePill>
			{p.state === "notAsked" ? (
				<Button className="min-h-control" disabled={busy} onClick={allow}>
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
	return (
		<div className="flex flex-col gap-2">
			<ul
				aria-label={t.onboarding.permissions.title}
				className="divide-y divide-n-6 rounded-lg border bg-surface-2"
			>
				{(list ?? []).map((p) => (
					<li key={p.kind}>
						<TourRow icon={ICON[p.kind]} label={t.onboarding.permissions.kind[p.kind]}>
							<PermissionControl permission={p} />
						</TourRow>
					</li>
				))}
			</ul>
			{open.length > 1 ? (
				<Button className="min-h-control self-end" onClick={() => void askAll(qc, list ?? [])}>
					{t.onboarding.permissions.allowAll}
				</Button>
			) : null}
		</div>
	);
}

/**
 * The page that holds the permissions and Replay the tour: Logs and feedback of This computer, or
 * Me for a role that does not see This computer (`spec:app-redesign#REQ-006`). Each role can reach them.
 */
export function usePermissionsPlace() {
	const { level } = useRights();
	return hiddenSection(level, "setup", "computer") ? "/setup/me" : "/setup/computer?page=logs";
}

/** What the system allows, and Replay the tour, as a card of Setup (REQ-004, REQ-009). */
export function PermissionsCard() {
	const { t } = useI18n();
	const m = t.onboarding;
	const list = usePermissions().data ?? [];
	const opener = list.find((p) => p.settings);
	return (
		<SetupCard id="section-permissions" title={t.personal.setup.allows}>
			{list.map((p) => (
				<SetupRow key={p.kind} id={`permission-${p.kind}`} label={m.permissions.kind[p.kind]}>
					<PermissionControl permission={p} />
				</SetupRow>
			))}
			{opener ? (
				<Row className="justify-end">
					<Button
						className="min-h-control"
						onClick={() =>
							void unwrap(commands.permissionsOpenSettings(opener.kind)).catch(logError)
						}
					>
						{m.permissions.settings}
					</Button>
				</Row>
			) : null}
		</SetupCard>
	);
}

/** Replay the tour: a row of the More card of the page that holds the permissions. */
export function ReplayTour() {
	const { t } = useI18n();
	const m = t.onboarding;
	return (
		<Fold label={m.tour}>
			<SetupRow id="tour" label={m.tour}>
				<Button className="min-h-control" onClick={openTour}>
					{m.replay}
				</Button>
			</SetupRow>
		</Fold>
	);
}
