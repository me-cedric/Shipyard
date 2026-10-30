import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo } from "react";
import {
	type Automation_Serialize,
	type AutomationView_Serialize,
	commands,
	type ItemFilter_Deserialize,
	isTauri,
	type SyncConnection_Serialize,
	unwrap,
	type WorkItemView_Serialize,
} from "@/lib/ipc";

export type SyncConnection = SyncConnection_Serialize;
export type WorkItem = WorkItemView_Serialize;
export type AutomationView = AutomationView_Serialize;
export type Automation = Automation_Serialize;
export type ItemFilter = ItemFilter_Deserialize;

/** The engine tells the views after each tick and each change of the mirror. */
const TICK_EVENT = "sync-tick";
/** The shortest interval that the engine accepts (REQ-002). */
export const MIN_INTERVAL = 30;

/** `10:42`, in the language of the person. `seconds` is Unix time. */
export const clock = (seconds: number, lang: string) =>
	new Date(seconds * 1000).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });

export const syncKeys = {
	all: ["sync"] as const,
	state: ["sync", "state"] as const,
	automation: ["sync", "automation"] as const,
	items: (filter: ItemFilter) => ["sync", "items", filter] as const,
};

/** Every sync view reads its data again when a tick ends. Mount it once, in the shell. */
export function useSyncTick() {
	const qc = useQueryClient();
	useEffect(() => {
		if (!isTauri()) return;
		const off = listen(TICK_EVENT, () => qc.invalidateQueries({ queryKey: syncKeys.all }));
		return () => void off.then((f) => f());
	}, [qc]);
}

/** The state of each connection of the active project. Empty without a tracker. */
export function useSyncState() {
	return useQuery({
		queryKey: syncKeys.state,
		queryFn: () => unwrap(commands.syncState()),
		refetchInterval: 10_000,
	});
}

/** The sync action: one tick now. It throws the failed polls, so the shell shows them. */
export function useSyncNow() {
	const qc = useQueryClient();
	return useCallback(async () => {
		try {
			const report = await unwrap(commands.syncNow());
			if (report.failed.length > 0)
				throw new Error(report.failed.map((f) => `${f.connection}: ${f.message}`).join("; "));
			return report;
		} finally {
			await qc.invalidateQueries({ queryKey: syncKeys.all });
		}
	}, [qc]);
}

export function useAutomation() {
	return useQuery({
		queryKey: syncKeys.automation,
		queryFn: () => unwrap(commands.syncAutomationGet()),
	});
}

/** The mirrored tickets of the active project. No request leaves the machine. */
export function useWorkItems(filter: ItemFilter) {
	return useQuery({
		queryKey: syncKeys.items(filter),
		queryFn: () => unwrap(commands.syncItems(filter)),
	});
}

/** Import, adopt and link. Each one reads every sync view again after it runs. */
export function useBacklogActions() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(
			call: Promise<{ status: "ok"; data: T } | { status: "error"; error: unknown }>,
		) => {
			try {
				return await unwrap(call);
			} finally {
				await qc.invalidateQueries({ queryKey: syncKeys.all });
			}
		};
		return {
			/** Reads the open tickets and returns the count. Nothing is written yet. */
			planImport: () => run(commands.syncImportPlan()),
			confirmImport: () => run(commands.syncImportConfirm()),
			adopt: (key: string) => run(commands.syncAdopt(key)),
			link: (local: string, key: string) => run(commands.syncLink(local, key)),
			unlink: (local: string) => run(commands.syncUnlink(local)),
		};
	}, [qc]);
}
