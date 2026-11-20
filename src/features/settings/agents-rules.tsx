import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, LANGS, useI18n } from "@/lib/i18n";
import { commands, type RunnerTiers_Serialize, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { Avatar } from "@/ui/atoms/avatar";
import { BrandIcon, runnerName } from "@/ui/atoms/brand-icon";
import { Button } from "@/ui/atoms/button";
import { Caption, Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { Fold } from "./connections/fold";
import { runnerKeys } from "./connections/keys";
import { Column, Columns, SetupCard, SetupRow, StatePill, Toggle } from "./parts";
import { ProviderRows } from "./provider-rows";

const TIERS = ["top", "mid", "small"] as const;
const EFFORT = { top: "topEffort", mid: "midEffort", small: "smallEffort" } as const;
const tiersKey = ["tiers"] as const;
/** The Select has no empty value: this one stands for "the tool decides". */
const AUTO = "auto";

/**
 * One runner: a model and an effort for each tier. A detected tool gives its models and the levels
 * that each model accepts; the effort shows only for a model that accepts one. A tool that lists
 * no model, or one that is not installed, keeps a free text field. A choice saves at once, a typed
 * model when the field loses focus.
 */
function TierRow({
	row,
	detected,
	split,
	extra,
}: {
	row: RunnerTiers_Serialize;
	detected: boolean;
	/** One row of the card for each tier, in place of one row for the tool. The levels are under More. */
	split?: boolean;
	/** More rows of the More row of a split card. */
	extra?: ReactNode;
}) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const [draft, setDraft] = useState(row);
	const catalog = useQuery({
		queryKey: ["runner-catalog", row.runner],
		queryFn: () => unwrap(commands.runnersCatalog(row.runner)),
		enabled: detected,
		staleTime: 5 * 60_000,
	}).data;
	const save = (next: RunnerTiers_Serialize) =>
		run(async () => {
			qc.setQueryData(tiersKey, await unwrap(commands.tiersSet(next)));
		});
	/** The levels of the model of a tier: its own, or the tool's for the default model. */
	const levels = (model: string) =>
		model === ""
			? (catalog?.efforts ?? [])
			: (catalog?.models.find((m) => m.id === model)?.efforts ?? []);
	const pick = (tier: (typeof TIERS)[number], model: string) => {
		const next = { ...draft, [tier]: model };
		if (!levels(model).includes(next[EFFORT[tier]])) next[EFFORT[tier]] = "";
		setDraft(next);
		void save(next);
	};
	const listed = detected && (catalog?.models.length ?? 0) > 0;
	/** The model of a tier, and its effort when the model accepts one. */
	const cell = (tier: (typeof TIERS)[number], part: "model" | "effort" | "both" = "both") => {
		const name = `${runnerName(row.runner)} ${t.settings.tiers[tier]}`;
		const ids = catalog?.models.map((m) => m.id) ?? [];
		const efforts = listed ? levels(draft[tier]) : [];
		// A level saved before, that the tool no longer accepts: shown, never passed on.
		const saved = draft[EFFORT[tier]];
		const unknown = listed && saved !== "" && !efforts.includes(saved);
		return (
			<>
				{listed ? (
					<span className="flex flex-col gap-1">
						{part === "effort" ? null : (
							<Select
								label={name}
								className="w-full"
								value={draft[tier] || AUTO}
								onValueChange={(v) => pick(tier, v === AUTO ? "" : v)}
								items={[
									{ value: AUTO, label: t.settings.tiers.default },
									// A model saved before the list, or typed by hand, stays pickable.
									...(draft[tier] && !ids.includes(draft[tier])
										? [{ value: draft[tier], label: draft[tier] }]
										: []),
									...ids.map((id) => ({ value: id, label: id })),
								]}
							/>
						)}
						{part !== "model" && (efforts.length > 0 || unknown) ? (
							<Select
								label={`${name} ${t.settings.tiers.effort}`}
								className="w-full"
								value={draft[EFFORT[tier]] || AUTO}
								onValueChange={(v) => {
									const next = { ...draft, [EFFORT[tier]]: v === AUTO ? "" : v };
									setDraft(next);
									void save(next);
								}}
								items={[
									{ value: AUTO, label: t.settings.tiers.default },
									...(unknown
										? [
												{
													value: saved,
													label: format(t.settings.tiers.unsupported, { level: saved }),
												},
											]
										: []),
									...efforts.map((e) => ({ value: e, label: e })),
								]}
							/>
						) : null}
					</span>
				) : part === "effort" ? null : (
					<Input
						label={name}
						value={draft[tier]}
						onChange={(e) => setDraft({ ...draft, [tier]: e.target.value })}
						onBlur={() => draft[tier] !== row[tier] && void save(draft)}
					/>
				)}
			</>
		);
	};
	const alert = error ? (
		<p role="alert" className="px-6 text-ui text-danger-text">
			{error}
		</p>
	) : null;
	if (split)
		return (
			<>
				{TIERS.map((tier) => (
					<SetupRow key={tier} label={t.personal.setup.tier[tier]}>
						{cell(tier, "model")}
					</SetupRow>
				))}
				{alert}
				<Fold label={t.ui.more}>
					{TIERS.map((tier) => {
						const control = cell(tier, "effort");
						const saved = draft[EFFORT[tier]];
						const has = listed && (levels(draft[tier]).length > 0 || saved !== "");
						return has ? (
							<SetupRow
								key={tier}
								label={`${t.personal.setup.tier[tier]}: ${t.settings.tiers.effort}`}
							>
								{control}
							</SetupRow>
						) : null;
					})}
					{extra}
				</Fold>
			</>
		);
	return (
		<>
			<SettingsRow label={runnerName(row.runner)} icon={<BrandIcon name={row.runner} size={14} />}>
				<div className="grid w-full grid-cols-3 gap-2">
					{TIERS.map((tier) => (
						<Caption key={tier} label={t.settings.tiers[tier]}>
							{cell(tier)}
						</Caption>
					))}
				</div>
			</SettingsRow>
			{alert}
		</>
	);
}

/** How long the view asks the status command after a sign-in starts, and how often. */
const WAIT_CAP = 5 * 60_000;
const WAIT_STEP = 3000;

/**
 * One row for each coding tool: name, version, sign-in state and one action. "Sign in" runs the
 * login of the tool in the integrated terminal (Q-133) and then asks the status command until the
 * tool says signed in. A missing tool offers its install. Shipyard never reads a token.
 */
function ToolRows() {
	const { t } = useI18n();
	const s = t.settings.signIn;
	const { runInTerminal } = useShell();
	const { failure, run } = useGuard();
	const [waiting, setWaiting] = useState<string | null>(null);
	const [keyForm, setKeyForm] = useState(false);
	const [key, setKey] = useState("");
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
		// A tool that is not "signed out" has no state to wait for.
		refetchInterval: (q) =>
			q.state.data?.find((r) => r.id === waiting)?.auth === "signedOut" ? WAIT_STEP : false,
	});
	const signIn = (id: string, device: boolean) =>
		run(async () => {
			runInTerminal(await unwrap(commands.runnerSignIn(id, device, true)));
			setWaiting(id);
			setTimeout(() => setWaiting((w) => (w === id ? null : w)), WAIT_CAP);
			await runners.refetch();
		});
	const saveKey = () =>
		run(async () => {
			const value = key;
			// The key never stays in the view: clear it whatever the result.
			setKey("");
			await unwrap(commands.runnerCodexApiKey(value, true));
			setKeyForm(false);
			await runners.refetch();
		});
	const rows = runners.data ?? [];
	const codex = rows.find(
		(r) => r.id === "codex" && r.state !== "missing" && r.auth !== "signedIn",
	);
	return (
		<SetupCard id="tools" title={t.personal.setup.toolSignIn}>
			{rows.map((r) => {
				const missing = r.state === "missing";
				const label = missing
					? s.missing
					: waiting === r.id && r.auth === "signedOut"
						? s.waiting
						: s[r.auth];
				const out = !missing && r.auth !== "signedIn";
				return (
					<div key={r.id} className="contents">
						<SetupRow label={<span title={r.version ?? undefined}>{r.label}</span>}>
							<StatePill
								state={
									missing
										? "off"
										: r.auth === "signedIn"
											? "ready"
											: out && r.auth === "signedOut"
												? "fix"
												: "off"
								}
							>
								{label}
							</StatePill>
							{missing ? null : out ? (
								<Button variant="primary" onClick={() => void signIn(r.id, false)}>
									{s.action}
								</Button>
							) : null}
						</SetupRow>
					</div>
				);
			})}
			{codex ? (
				<Fold aria-label={`${codex.label}: ${t.ui.more}`} label={t.ui.more}>
					<div className="flex flex-wrap gap-2 px-6 pb-2">
						<Button onClick={() => void signIn(codex.id, true)}>{s.code}</Button>
						<Button aria-expanded={keyForm} onClick={() => setKeyForm(!keyForm)}>
							{s.apiKey}
						</Button>
					</div>
					{keyForm ? (
						<form
							className="flex flex-wrap items-end gap-2 px-6 py-2"
							onSubmit={(e) => {
								e.preventDefault();
								void saveKey();
							}}
						>
							<Input
								autoFocus
								label={s.apiKeyField}
								type="password"
								autoComplete="off"
								value={key}
								onChange={(e) => setKey(e.target.value)}
								className="w-72"
							/>
							<Button type="submit" variant="primary" disabled={!key.trim()}>
								{s.save}
							</Button>
						</form>
					) : null}
				</Fold>
			) : null}
			<ErrorNotice error={failure} className="px-6" />
		</SetupCard>
	);
}

const compassKey = ["compass"] as const;

/** The models of the default AI tool, one row for each tier, and the language of the prompts. The other tools are under a row that opens. */
function ModelsCard() {
	const { t } = useI18n();
	const p = t.personal.setup;
	const { defaultAgent, promptLang, setPrefs } = usePrefs();
	const tiers = useQuery({ queryKey: tiersKey, queryFn: () => unwrap(commands.tiersGet()) });
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	});
	const detected = (id: string) => runners.data?.find((r) => r.id === id)?.state === "detected";
	const rows = tiers.data ?? [];
	const main =
		rows.find((r) => r.runner === defaultAgent) ?? rows.find((r) => detected(r.runner)) ?? rows[0];
	const others = rows.filter((r) => r !== main);
	return (
		<SetupCard id="tiers" title={p.models}>
			{/* The saved row keys the draft: a refused edit keeps the typed text until the person fixes it. */}
			{main ? (
				<TierRow
					key={main.runner}
					row={main}
					detected={detected(main.runner)}
					split
					extra={
						<>
							{others.map((row) => (
								<TierRow key={row.runner} row={row} detected={detected(row.runner)} />
							))}
							<SetupRow label={t.connections.group.provider}>{null}</SetupRow>
							<div className="flex flex-col gap-2 px-6">
								<ProviderRows />
							</div>
						</>
					}
				/>
			) : null}
			<SetupRow label={t.prefs.promptLang}>
				<Select
					label={t.prefs.promptLang}
					value={promptLang || "follow"}
					onValueChange={(v) => setPrefs({ promptLang: v === "follow" ? "" : v })}
					items={[
						{ value: "follow", label: t.prefs.promptFollow },
						...LANGS.map((l) => ({ value: l, label: t.lang[l] })),
					]}
				/>
			</SetupRow>
		</SetupCard>
	);
}

/** The roles that the agents of the project load, each with its letter. */
function RolesCard() {
	const { t } = useI18n();
	const roles = useQuery({
		queryKey: ["roles-skills"],
		queryFn: () => unwrap(commands.rolesSkillsGet()),
	});
	const rows = (roles.data ?? []).filter((r) => r.kind === "role");
	if (!rows.length) return null;
	return (
		<SetupCard id="compass-roles" title={t.personal.setup.roles}>
			{rows.map((r) => (
				<Row key={r.name}>
					<Avatar agent name={r.name} />
					<span className="min-w-0 font-semibold">{r.name}</span>
				</Row>
			))}
		</SetupCard>
	);
}

/**
 * The working rules of the agents: one switch for each pattern of the project. On writes the
 * rule into the project, off removes it. The lists with every action are the text view.
 */
function RulesCard({ children }: { children: ReactNode }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const gate = useRights().gate("project.settings");
	const compass = useQuery({ queryKey: compassKey, queryFn: () => unwrap(commands.compassGet()) });
	const rules = (compass.data?.entries ?? []).filter((e) => e.kind === "pattern");
	const set = (id: string, on: boolean) =>
		run(async () => {
			if (on) await unwrap(commands.compassApply([`pattern:${id}`]));
			else await unwrap(commands.compassRemove("pattern", id, true));
			await qc.invalidateQueries({ queryKey: compassKey });
		});
	return (
		<SetupCard id="compass-pattern" title={t.personal.setup.rules}>
			{rules.map((e) => (
				<SetupRow key={e.id} label={e.title}>
					<Toggle
						label={e.title}
						checked={e.state !== "absent"}
						disabled={gate.disabled}
						reason={gate.reason}
						onCheckedChange={(on) => void set(e.id, on)}
					/>
				</SetupRow>
			))}
			{error ? (
				<p role="alert" className="px-6 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<Row className="gap-2.5">{children}</Row>
		</SetupCard>
	);
}

/**
 * Setup / This computer / Models and rules: the sign-in of each AI tool and the model of each
 * tier (factory REQ-012), then the roles and the working rules of the agents. The compass lists
 * with every action are the page "Rules as text".
 */
export function AgentsRules() {
	const { t } = useI18n();
	const router = useRouter();
	return (
		<Columns>
			<Column>
				<ToolRows />
				<ModelsCard />
			</Column>
			<Column>
				<RolesCard />
				<RulesCard>
					<Button
						variant="secondary"
						onClick={() => router.history.push("/setup/computer?page=rules")}
					>
						{t.personal.setup.editText}
					</Button>
					<Button
						variant="secondary"
						onClick={() => router.history.push("/library/specs/constitution")}
					>
						{t.personal.setup.projectRules}
					</Button>
				</RulesCard>
			</Column>
		</Columns>
	);
}
