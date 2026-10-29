import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type ApplyRow_Serialize,
	type Bar_Serialize,
	type Calendar_Deserialize,
	type Calendar_Serialize,
	commands,
	type Decisions_Deserialize,
	type Decisions_Serialize,
	type DiffRow_Serialize,
	type Feature_Serialize,
	type Member_Serialize,
	type PlanView_Serialize,
	type Portfolio,
	type Preview_Serialize,
	type Row_Deserialize,
	type SealState,
	type Sheet_Deserialize,
	type Sheet_Serialize,
	type SheetItem_Serialize,
	type SheetView_Serialize,
	type Suggestion,
	type Task_Serialize,
	type Team_Deserialize,
	type TeamView_Serialize,
	type TimeRow_Serialize,
	type TimeSent_Serialize,
	type TimeView_Serialize,
	unwrap,
	type WorkContext_Serialize,
} from "@/lib/ipc";
import { syncKeys } from "@/lib/sync";

export type Member = Member_Serialize;
export type TeamView = TeamView_Serialize;
export type WorkContext = WorkContext_Serialize;
export type Sheet = Sheet_Serialize;
export type Feature = Feature_Serialize;
export type Task = Task_Serialize;
export type SheetItem = SheetItem_Serialize;
export type SheetView = SheetView_Serialize;
export type Plan = PlanView_Serialize;
export type Bar = Bar_Serialize;
export type Decisions = Decisions_Serialize;
export type Calendar = Calendar_Serialize;
export type DiffRow = DiffRow_Serialize;
export type ApplyRow = ApplyRow_Serialize;
export type Preview = Preview_Serialize;
export type TimeView = TimeView_Serialize;
export type TimeRow = TimeRow_Serialize;
export type Seal = SealState;
export {
	addDays,
	addMonths,
	diffDays,
	figure,
	formatMinutes,
	isDay,
	isoWeekday,
	money,
	monthLabel,
	parseDuration,
	slugify,
} from "./dates";

export const workKeys = {
	all: ["work"] as const,
	context: ["work", "context"] as const,
	team: ["work", "team"] as const,
	seal: ["work", "seal"] as const,
	sheets: ["work", "sheets"] as const,
	sheet: (slug: string) => ["work", "sheet", slug] as const,
	portfolio: ["work", "portfolio"] as const,
	plan: (slug: string) => ["work", "plan", slug] as const,
	time: (member: string | null, month: string) => ["work", "time", member, month] as const,
	suggest: (key: string) => ["work", "suggest", key] as const,
	apply: (slugs: string[]) => ["work", "apply", slugs] as const,
};

/** The tracker flags, the pickup label, the scope and the member of this machine. The offset is
 * the one of this screen, so `today` is the day of the person and not the day of Greenwich. */
export function useWorkContext() {
	return useQuery({
		queryKey: workKeys.context,
		queryFn: () => unwrap(commands.workContext(-new Date().getTimezoneOffset())),
	});
}

export function useTeam() {
	return useQuery({ queryKey: workKeys.team, queryFn: () => unwrap(commands.workTeam()) });
}

export function useSealState() {
	return useQuery({ queryKey: workKeys.seal, queryFn: () => unwrap(commands.workSealState()) });
}

export function useSheets() {
	return useQuery({ queryKey: workKeys.sheets, queryFn: () => unwrap(commands.estimateList()) });
}

export function useSheet(slug: string | null) {
	return useQuery({
		queryKey: workKeys.sheet(slug ?? ""),
		queryFn: () => unwrap(commands.estimateGet(slug ?? "")),
		enabled: slug !== null,
	});
}

export function usePortfolio() {
	return useQuery({
		queryKey: workKeys.portfolio,
		queryFn: () => unwrap(commands.estimatePortfolio()),
	});
}

export function usePlan(slug: string | null) {
	return useQuery({
		queryKey: workKeys.plan(slug ?? ""),
		queryFn: () => unwrap(commands.planGet(slug ?? "")),
		enabled: slug !== null,
	});
}

/** The entries of one month. A member that cannot be resolved makes the query fail with the reason. */
export function useTimeView(member: string | null, month: string) {
	return useQuery({
		queryKey: workKeys.time(member, month),
		queryFn: () => unwrap(commands.timeList(member, month)),
		enabled: month !== "",
		retry: false,
	});
}

/** The ranked members for one ticket. It assigns nobody (REQ-007). */
export function useSuggestions(key: string) {
	return useQuery<Suggestion[]>({
		queryKey: workKeys.suggest(key),
		queryFn: () => unwrap(commands.workSuggest(key)),
	});
}

/** The rows that an apply would write, for the sheets. Nothing is written (REQ-025). */
export function useApplyPreview(slugs: string[], enabled: boolean) {
	return useQuery({
		queryKey: workKeys.apply(slugs),
		queryFn: () => unwrap(commands.applyPreview(slugs)),
		enabled,
		retry: false,
	});
}

type Call<T> = Promise<{ status: "ok"; data: T } | { status: "error"; error: string }>;

/**
 * Every write of the Work space. Each one is called from a click, so each one passes `click`.
 * After a write the views read their data again, the tracker mirror included.
 */
export function useWorkActions() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(call: Call<T>) => {
			try {
				return await unwrap(call);
			} finally {
				await Promise.all([
					qc.invalidateQueries({ queryKey: workKeys.all }),
					qc.invalidateQueries({ queryKey: syncKeys.all }),
				]);
			}
		};
		return {
			assign: (key: string, member: string) => run(commands.workAssign(key, member, true)),
			mark: (key: string) => run(commands.workMark(key, true)),
			transition: (key: string, to: string) => run(commands.workTransition(key, to, true)),
			saveTeam: (team: Team_Deserialize) => run(commands.workTeamSave(team)),
			unlock: (passphrase: string) => run(commands.workUnlock(passphrase)),
			lock: () => run(commands.workLock()),
			seal: (passphrase: string) => run(commands.workSeal(passphrase)),
			unseal: (passphrase: string) => run(commands.workUnseal(passphrase)),
			saveSheet: (slug: string, sheet: Sheet_Deserialize) =>
				run(commands.estimateSave(slug, sheet)),
			previewExcel: (path: string, scope: string | null) => run(commands.excelPreview(path, scope)),
			confirmExcel: (slug: string) => run(commands.excelConfirm(slug, true)),
			exportExcel: (slug: string, path: string) => run(commands.excelExport(slug, path)),
			saveDecisions: (d: Decisions_Deserialize) => run(commands.planDecisionsSave(d)),
			saveCalendar: (c: Calendar_Deserialize) => run(commands.planCalendarSave(c)),
			addTime: (
				member: string | null,
				day: string,
				minutes: number,
				note: string,
				ticket: string | null,
			) => run(commands.timeAdd(member, day, minutes, note, ticket)),
			fetchTime: (member: string | null, ticket: string) => run(commands.timeFetch(member, ticket)),
			sendTime: (
				member: string | null,
				day: string,
				id: string,
				reduceRemaining: boolean,
			): Promise<TimeSent_Serialize> =>
				run(
					commands.timeSend(
						member,
						day,
						id,
						-new Date().getTimezoneOffset(),
						reduceRemaining,
						true,
					),
				),
			apply: (slugs: string[]) => run(commands.applyRun(slugs, true)),
			previewItem: (row: Row_Deserialize) => run(commands.workItemPreview(row)),
			createItem: (row: Row_Deserialize) => run(commands.workItemCreate(row, true)),
		};
	}, [qc]);
}

/** The name that a handle shows: the member's name, or the handle when the team lacks it. */
export const memberName = (members: Member[], handle: string | null | undefined) =>
	members.find((m) => m.handle === handle)?.name ?? handle ?? "";

export type { Portfolio };
