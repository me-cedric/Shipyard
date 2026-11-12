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
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { Input } from "@/ui/atoms/input";
import type { Status } from "@/ui/atoms/status-dot";
import {
	ArrowPathIcon,
	ArrowUpTrayIcon,
	BookOpenIcon,
	CommandLineIcon,
	CpuChipIcon,
	DocumentTextIcon,
	MagnifyingGlassIcon,
	PuzzlePieceIcon,
	ShieldCheckIcon,
	SparklesIcon,
	Squares2X2Icon,
	TrashIcon,
	UsersIcon,
} from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { EntryRow } from "@/ui/molecules/entry-row";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { SectionNav } from "@/ui/molecules/section-nav";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { WriteReportView } from "@/ui/molecules/write-report";
import { SETTINGS_PAGE } from "@/ui/templates/settings";
import { CompassSetup } from "./compass-setup";

const KINDS: EntryKind[] = ["skill", "pack", "guide", "pattern", "contract"];
const KIND_ICON: Record<EntryKind, ReactNode> = {
	skill: <SparklesIcon size={14} />,
	pack: <PuzzlePieceIcon size={14} />,
	guide: <BookOpenIcon size={14} />,
	pattern: <Squares2X2Icon size={14} />,
	contract: <DocumentTextIcon size={14} />,
};
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

/** The compass part of Settings / Agents and rules: the setup, five lists, apply, upgrade, roles and skills. */
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
	const policies = useQuery({
		queryKey: ["compass-policies"],
		queryFn: () => unwrap(commands.compassPolicies()),
	});
	const [rules, setRules] = useState("");
	const [imported, setImported] = useState<string | null>(null);
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
	/** A change of the project that returns no report: the lists read again. */
	const change = (job: () => Promise<unknown>) =>
		run(async () => {
			await job();
			await qc.invalidateQueries({ queryKey: compassKey });
			await qc.invalidateQueries({ queryKey: ["compass-policies"] });
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

	// The section list shows the sections that are on the page, the two of the Agents part included.
	const sections = [
		{ id: "tools", label: t.settings.signIn.name, icon: <CommandLineIcon size={14} /> },
		{ id: "tiers", label: t.settings.tiers.name, icon: <CpuChipIcon size={14} /> },
		...KINDS.map((k) => ({
			id: `compass-${k}`,
			label: x.compass.kind[k],
			icon: KIND_ICON[k],
		})),
		{ id: "compass-policy", label: x.compass.policy, icon: <ShieldCheckIcon size={14} /> },
		{ id: "compass-roles", label: x.compass.roles, icon: <UsersIcon size={14} /> },
	];
	return (
		<div className="flex flex-col">
			<PageHeader
				icon={<SparklesIcon size={16} />}
				title={t.tabs.settings["agents-rules"]}
				chips={
					data ? (
						<>
							<Badge variant="accent">
								{format(x.compass.version, { version: data.pinned ?? data.version })}
							</Badge>
							{data.stacks.map((s) => (
								<Badge key={s} variant="info">
									{format(x.compass.stack, { name: s })}
								</Badge>
							))}
						</>
					) : undefined
				}
				action={
					data ? (
						<RightButton
							right="project.settings"
							id="compass-upgrade"
							variant="primary"
							disabled={count === 0}
							onClick={() =>
								void write(() => unwrap(commands.compassUpgrade(picked.size ? [...picked] : null)))
							}
						>
							<ArrowPathIcon size={14} />
							{format(x.compass.upgradeCount, { count })}
						</RightButton>
					) : undefined
				}
			/>
			<SectionNav label={t.ui.sections} items={sections} />
			<div className={SETTINGS_PAGE}>
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}
				{data === undefined ? null : data === null ? (
					<EmptyState
						title={t.empty.compass}
						action={{
							label: x.compass.add,
							icon: <ArrowPathIcon size={14} />,
							onClick: () => void write(() => unwrap(commands.compassUpgrade(null))),
						}}
					/>
				) : (
					<>
						<CompassSetup />
						{report ? <WriteReportView report={report} /> : null}
						<div className="flex items-end gap-2">
							<Input
								label={x.compass.importPath}
								value={rules}
								onChange={(e) => setRules(e.target.value)}
								className="w-72"
							/>
							<RightButton
								right="project.settings"
								disabled={!rules.trim()}
								onClick={() =>
									void change(async () => {
										const key = await unwrap(commands.compassImport(rules.trim(), true));
										setReport(null);
										setRules("");
										setImported(key);
									})
								}
							>
								<ArrowUpTrayIcon size={14} />
								{x.compass.import}
							</RightButton>
						</div>
						{imported ? (
							<p role="status" className="text-12 text-n-11">
								{format(x.compass.imported, { key: imported })}
							</p>
						) : null}
						<div className="relative w-72">
							<span
								aria-hidden="true"
								className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-n-10"
							>
								<MagnifyingGlassIcon size={14} />
							</span>
							<Input
								className="pl-7"
								label={x.compass.search}
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						</div>
						{KINDS.map((kind) => {
							const rows = data.entries.filter((e) => e.kind === kind && match(e));
							return (
								<Panel
									key={kind}
									id={`compass-${kind}`}
									title={x.compass.kind[kind]}
									count={rows.length}
									icon={KIND_ICON[kind]}
									flush
								>
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
														{format(x.compass.risk, {
															level: x.compass.riskLevel[e.risk] ?? e.risk,
														})}
													</Badge>
												) : null}
												{e.writes ? <Badge>{x.compass.writes}</Badge> : null}
												{e.suits ? <Badge variant="success">{x.compass.suits}</Badge> : null}
												{e.kind === "pattern" || e.kind === "skill" || e.kind === "pack" ? (
													e.state === "absent" ? null : (
														<RightButton
															right="project.settings"
															variant="ghost"
															aria-label={format(x.compass.removeName, { name: e.title })}
															onClick={() =>
																void change(() =>
																	unwrap(commands.compassRemove(e.kind, e.id, true)),
																)
															}
														>
															<TrashIcon size={14} />
															{x.compass.remove}
														</RightButton>
													)
												) : null}
												{e.state === "current" ? null : (
													<RightButton
														right="project.settings"
														aria-label={format(x.compass.applyName, { name: e.title })}
														onClick={() =>
															void write(() => unwrap(commands.compassApply([keyOf(e)])))
														}
													>
														{x.compass.apply}
													</RightButton>
												)}
											</EntryRow>
										))}
									</ul>
								</Panel>
							);
						})}
					</>
				)}
				<Panel
					id="compass-policy"
					title={x.compass.policy}
					count={policies.data?.packs.length ?? 0}
					icon={<ShieldCheckIcon size={14} />}
					flush
				>
					{(policies.data?.packs ?? []).map((p) => (
						<SettingsRow key={p.id} label={p.id}>
							{policies.data?.applied === p.id ? (
								<Badge variant="success">{x.compass.policyApplied}</Badge>
							) : (
								<RightButton
									right="project.settings"
									aria-label={format(x.compass.policyApply, { name: p.id })}
									onClick={() =>
										void change(async () =>
											setReport({
												written: await unwrap(commands.compassPolicyApply(p.id, true)),
												kept: [],
											}),
										)
									}
								>
									{x.compass.apply}
								</RightButton>
							)}
						</SettingsRow>
					))}
				</Panel>
				<Panel
					id="compass-roles"
					title={x.compass.roles}
					count={roles.data?.length ?? 0}
					icon={<UsersIcon size={14} />}
					flush
				>
					{(roles.data ?? []).map((r) => (
						<SettingsRow key={`${r.kind}:${r.name}`} label={r.name}>
							<Badge>{r.kind === "role" ? x.compass.role : x.compass.skill}</Badge>
							<span className="text-12 text-n-11">
								{format(x.compass.loadedBy, { names: r.loaders.join(", ") })}
							</span>
						</SettingsRow>
					))}
				</Panel>
				{children}
			</div>
		</div>
	);
}
