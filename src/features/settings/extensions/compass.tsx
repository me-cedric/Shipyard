import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import {
	type CompassApplied,
	commands,
	type CompassEntry_Serialize as Entry,
	type EntryKind,
	type SyncState,
	unwrap,
} from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import type { Status } from "@/ui/atoms/status-dot";
import { ArrowPathIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { EntryRow } from "@/ui/molecules/entry-row";
import { GroupSection } from "@/ui/molecules/group-section";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { WriteReportView } from "@/ui/molecules/write-report";

const KINDS: EntryKind[] = ["skill", "pack", "guide", "pattern", "contract"];
const STATUS: Record<SyncState, Status> = { current: "success", stale: "warning", absent: "idle" };
const compassKey = ["compass"] as const;
const keyOf = (e: Entry) => `${e.kind}:${e.id}`;

/** The text of an entry, in the inspector. Reading it writes nothing. */
function EntryDetail({ entry }: { entry: Entry }) {
	const text = useQuery({
		queryKey: ["compass-preview", keyOf(entry)],
		queryFn: () => unwrap(commands.compassPreview(entry.kind, entry.id)),
	});
	return <pre className="whitespace-pre-wrap text-12">{text.data}</pre>;
}

/** The compass part of Settings / Agents and rules: five lists, apply, upgrade, roles and skills. */
export function Compass({ children }: { children: ReactNode }) {
	const { t } = useI18n();
	const x = t.extensions;
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const compass = useQuery({ queryKey: compassKey, queryFn: () => unwrap(commands.compassGet()) });
	const roles = useQuery({
		queryKey: ["roles-skills"],
		queryFn: () => unwrap(commands.rolesSkillsGet()),
	});
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const { openDetail } = useShell();
	const [query, setQuery] = useState("");
	const [report, setReport] = useState<CompassApplied["report"] | null>(null);

	const write = (job: () => Promise<CompassApplied>) =>
		run(async () => {
			setReport((await job()).report);
			setPicked(new Set());
			await qc.invalidateQueries({ queryKey: compassKey });
		});
	const data = compass.data;
	const stale = (data?.entries ?? []).filter((e) => e.state === "stale").length;
	const count = picked.size || stale;
	const match = (e: Entry) =>
		e.kind !== "skill" || `${e.id} ${e.title}`.toLowerCase().includes(query.trim().toLowerCase());
	const toggle = (k: string, on: boolean) =>
		setPicked((p) => {
			const next = new Set(p);
			if (on) next.add(k);
			else next.delete(k);
			return next;
		});

	return (
		<div className="max-w-2xl p-4">
			<h1 className="sr-only">{t.tabs.settings["agents-rules"]}</h1>
			{error ? (
				<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{data === undefined ? null : data === null ? (
				<EmptyState
					action={{
						label: x.compass.add,
						icon: <ArrowPathIcon size={14} />,
						onClick: () => void write(() => unwrap(commands.compassUpgrade(null))),
					}}
				/>
			) : (
				<>
					<div className="flex min-h-row items-center gap-2 px-3">
						<span className="flex-1 text-ui font-medium">
							{format(x.compass.version, { version: data.pinned ?? data.version })}
						</span>
						{data.stacks.map((s) => (
							<Badge key={s} variant="info">
								{format(x.compass.stack, { name: s })}
							</Badge>
						))}
						<Button
							variant="primary"
							disabled={count === 0}
							onClick={() =>
								void write(() => unwrap(commands.compassUpgrade(picked.size ? [...picked] : null)))
							}
						>
							<ArrowPathIcon size={14} />
							{format(x.compass.upgradeCount, { count })}
						</Button>
					</div>
					{report ? <WriteReportView report={report} /> : null}
					<div className="p-3">
						<Input
							label={x.compass.search}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</div>
					{KINDS.map((kind) => {
						const rows = data.entries.filter((e) => e.kind === kind && match(e));
						return (
							<GroupSection key={kind} name={x.compass.kind[kind]} count={rows.length}>
								<ul>
									{rows.map((e) => (
										<EntryRow
											key={keyOf(e)}
											name={e.title}
											status={STATUS[e.state]}
											statusLabel={x.compass.state[e.state]}
											onOpen={() => openDetail(e.title, <EntryDetail entry={e} />)}
											check={
												e.state === "current"
													? undefined
													: {
															label: format(x.compass.select, { name: e.title }),
															checked: picked.has(keyOf(e)),
															onChange: (on) => toggle(keyOf(e), on),
														}
											}
										>
											{e.risk ? (
												<Badge variant={e.risk === "high" ? "danger" : "neutral"}>
													{format(x.compass.risk, { level: e.risk })}
												</Badge>
											) : null}
											{e.writes ? <Badge>{x.compass.writes}</Badge> : null}
											{e.suits ? <Badge variant="success">{x.compass.suits}</Badge> : null}
											{e.state === "current" ? null : (
												<Button
													aria-label={format(x.compass.applyName, { name: e.title })}
													onClick={() =>
														void write(() => unwrap(commands.compassApply([keyOf(e)])))
													}
												>
													{x.compass.apply}
												</Button>
											)}
										</EntryRow>
									))}
								</ul>
							</GroupSection>
						);
					})}
				</>
			)}
			<GroupSection name={x.compass.roles} count={roles.data?.length ?? 0}>
				{(roles.data ?? []).map((r) => (
					<SettingsRow key={`${r.kind}:${r.name}`} label={r.name}>
						<Badge>{r.kind === "role" ? x.compass.role : x.compass.skill}</Badge>
						<span className="text-12 text-n-11">
							{format(x.compass.loadedBy, { names: r.loaders.join(", ") })}
						</span>
					</SettingsRow>
				))}
			</GroupSection>
			{children}
		</div>
	);
}
