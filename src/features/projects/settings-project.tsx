import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Column, Columns, SetupCard, SetupRow } from "@/features/settings/parts";
import { AutoCommit } from "@/features/settings/project/auto-commit";
import { AutoReview } from "@/features/settings/project/auto-review";
import { ButtonLink, Fold } from "@/features/settings/project/fold";
import { AgentsAlone } from "@/features/sync/automation";
import { HolidayCountry } from "@/features/work/holiday-country";
import { useWorkflows } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import {
	type Accent,
	type Contrast,
	commands,
	type Density,
	type Overrides_Serialize,
	type ProjectFile_Deserialize,
	type Theme,
	unwrap,
} from "@/lib/ipc";
import { PATH_DEFAULTS, projectKeys, useProjectActions } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { FolderOpenIcon } from "@/ui/icons";
import { ATTENTION_FRAME } from "@/ui/molecules/attention-card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { PersonasEditor } from "./personas";

/** The personas editor, for the page Logs and feedback (writer D mounts it). */
export { PersonasEditor as PersonasCard } from "./personas";

import { ProjectDetails, ProjectFolder } from "./project-details";
import { ProjectImport } from "./project-import";
import { ProjectOverrides } from "./project-overrides";
import { RepoTools } from "./repo-tools";
import { ScopePicker } from "./scope-picker";

const NONE = "none";
const ACCENTS: Accent[] = ["blue", "violet", "green", "orange", "rose"];

type Draft = {
	name: string;
	paths: Record<string, string>;
	workflow: string;
	/** The connection id for each purpose. Empty is none. */
	connections: { tracker: string; forge: string };
	/** The Jira project key, the repository, the Azure project or the Linear team. */
	scope: string;
	/** The language codes of the docs and of the pull requests. Empty: no rule. */
	languages: { docs: string; pulls: string };
};

const draftOf = (f: ProjectFile_Deserialize | null): Draft => ({
	name: f?.name ?? "",
	// Every key shows: a key that the file does not set shows its default.
	paths: { ...PATH_DEFAULTS, ...f?.paths },
	workflow: f?.defaultWorkflow ?? "",
	connections: { tracker: f?.connections?.tracker ?? "", forge: f?.connections?.forge ?? "" },
	scope: f?.connections?.trackerScope ?? "",
	languages: { docs: f?.languages?.docs ?? "", pulls: f?.languages?.pulls ?? "" },
});

// An invalid or missing project file leaves only the overrides. Settings / Health shows the finding.
function Form({
	file,
	overrides,
}: {
	file: ProjectFile_Deserialize | null;
	overrides: Overrides_Serialize;
}) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [draft, setDraft] = useState<Draft>(() => draftOf(file));
	const recipes = useWorkflows().data;
	// The same query as Settings / Connections: one cache.
	const connections = useQuery({
		queryKey: ["connections", "list"],
		queryFn: () => unwrap(commands.connectionsList()),
	}).data;
	const languages = useQuery({
		queryKey: ["creator", "options"],
		queryFn: () => unwrap(commands.creatorOptions()),
	}).data?.languages;
	const languageItems = (saved: string) => [
		{ value: NONE, label: t.projects.noConnection },
		...[...(languages ?? []), ...(saved && !languages?.includes(saved) ? [saved] : [])].map(
			(l) => ({
				value: l,
				label: t.creator.lang[l as keyof typeof t.creator.lang] ?? l,
			}),
		),
	];
	const connectionItems = (group: "tracker" | "forge") => {
		const saved = draft.connections[group];
		const rows = (connections ?? []).filter((c) => c.group === group);
		return [
			{ value: NONE, label: t.projects.noConnection },
			...rows.map((c) => ({ value: c.id, label: c.name })),
			// A saved id that is no longer in the list still shows, so a save does not drop it.
			...(saved && !rows.some((c) => c.id === saved) ? [{ value: saved, label: saved }] : []),
		];
	};
	const [error, setError] = useState<unknown>(null);
	const saved = draftOf(file);
	const dirty = file !== null && JSON.stringify(draft) !== JSON.stringify(saved);

	const save = async () => {
		if (!file) return;
		try {
			setError(null);
			await unwrap(
				commands.projectFileSave({
					...file,
					name: draft.name.trim() || file.name,
					// A key stays out of the file while it holds its default and the file did not set it.
					paths: Object.fromEntries(
						Object.entries(draft.paths)
							.map(([k, v]) => [k, v.trim()] as const)
							.filter(([k, v]) => k in (file.paths ?? {}) || v !== PATH_DEFAULTS[k]),
					),
					defaultWorkflow: draft.workflow.trim() || null,
					connections:
						draft.connections.tracker || draft.connections.forge || draft.scope.trim()
							? {
									tracker: draft.connections.tracker || null,
									forge: draft.connections.forge || null,
									trackerScope: draft.scope.trim() || null,
								}
							: null,
					languages:
						draft.languages.docs || draft.languages.pulls
							? { docs: draft.languages.docs || null, pulls: draft.languages.pulls || null }
							: null,
				}),
			);
			await qc.invalidateQueries();
		} catch (e) {
			setError(e);
		}
	};

	// An override goes to the registry at once. It never reaches the repository.
	const setOverride = async (patch: Partial<Overrides_Serialize>) => {
		await unwrap(commands.projectOverridesSave({ ...overrides, ...patch }));
		await qc.invalidateQueries();
	};
	const override = <K extends "theme" | "density" | "contrast" | "accent">(
		key: K,
		label: string,
		icon: React.ReactNode,
		options: { value: NonNullable<Overrides_Serialize[K]>; label: string }[],
	) => ({
		id: key,
		icon,
		label,
		// The mark: a project value replaces the value of the person.
		control: (
			<span className="flex items-center gap-2">
				{overrides[key] ? <StatusDot status="info" label={t.projects.overridden} /> : null}
				<Select
					label={label}
					value={overrides[key] ?? NONE}
					onValueChange={(v) => setOverride({ [key]: v === NONE ? null : v })}
					items={[{ value: NONE, label: t.projects.noOverride }, ...options]}
				/>
			</span>
		),
	});

	const figma = useQuery({
		queryKey: ["figma", "token"],
		queryFn: () => unwrap(commands.figmaTokenState()),
	}).data;
	const budget = useQuery({
		queryKey: ["workflow", "feature"],
		queryFn: () => unwrap(commands.workflowGet("feature")),
	}).data;
	const p = t.doctor.project;
	const limit = /budget_usd:\s*([\d.]+)/.exec(budget?.text ?? "")?.[1];
	const languageName = (code: string) =>
		t.creator.lang[code as keyof typeof t.creator.lang] ?? code;
	const picked = (["docs", "pulls"] as const)
		.map((k) => draft.languages[k])
		.filter((v, i, all) => v && all.indexOf(v) === i)
		.map(languageName);
	const pathInput = (kind: string) => {
		const label = (t.projects.path as Record<string, string>)[kind] ?? kind;
		return (
			<Input
				key={kind}
				label={label}
				value={draft.paths[kind] ?? ""}
				onChange={(e) => setDraft({ ...draft, paths: { ...draft.paths, [kind]: e.target.value } })}
			/>
		);
	};
	const overrideRows = [
		override(
			"theme",
			t.prefs.theme,
			null,
			(["light", "dark", "oled", "system", "system-oled"] as Theme[]).map((v) => ({
				value: v,
				label: t.theme[v],
			})),
		),
		override(
			"density",
			t.prefs.density,
			null,
			(["default", "compact"] as Density[]).map((v) => ({
				value: v,
				label: v === "compact" ? t.prefs.compact : t.projects.noOverride,
			})),
		),
		override(
			"contrast",
			t.prefs.contrast,
			null,
			(["default", "high"] as Contrast[]).map((v) => ({
				value: v,
				label: v === "high" ? t.prefs.contrast : t.projects.noOverride,
			})),
		),
		override(
			"accent",
			t.projects.accent,
			null,
			ACCENTS.map((v) => ({ value: v, label: t.projects.accents[v] })),
		),
	].map((o) => (
		<span key={o.id} className="flex flex-wrap items-center justify-between gap-3">
			<span className="font-semibold">{o.label}</span>
			{o.control}
		</span>
	));
	const connection = (group: "tracker" | "forge") => {
		const id = draft.connections[group];
		return (
			<ConnectionCard
				key={group}
				id={group === "tracker" ? "issue-tracker" : "code-host"}
				title={p[group === "tracker" ? "tracker" : "host"]}
				connected={!!id}
				attention={!id}
				action={
					<ButtonLink
						// With an account, the choice sits behind More on this page; with none, add one first.
						href={
							(connections ?? []).some((c) => c.group === group)
								? `/setup/project#${group === "tracker" ? "more-issue-tracker" : "more-code-host"}`
								: "/setup/project?page=connections"
						}
						primary={!id}
						className="w-full"
					>
						{id ? p.change : p.connect}
					</ButtonLink>
				}
			/>
		);
	};
	// The choice of connection: behind More, not in the connection cards.
	const connectionPick = (group: "tracker" | "forge") => (
		<Fold
			id={group === "tracker" ? "more-issue-tracker" : "more-code-host"}
			label={p[group === "tracker" ? "tracker" : "host"]}
			value={
				connectionItems(group).find((i) => i.value === (draft.connections[group] || NONE))?.label
			}
		>
			<Select
				label={t.connections.type[group]}
				value={draft.connections[group] || NONE}
				onValueChange={(v) =>
					setDraft({
						...draft,
						connections: { ...draft.connections, [group]: v === NONE ? "" : v },
					})
				}
				items={connectionItems(group)}
			/>
		</Fold>
	);
	return (
		<div className="flex flex-col">
			{file ? (
				<div id="connections" className="flex flex-wrap items-start gap-4 px-4 pb-4">
					{connection("tracker")}
					{connection("forge")}
					<ConnectionCard
						title={p.figma}
						connected={figma === true}
						action={
							<ButtonLink href="/library/screens" className="w-full">
								{figma ? p.change : p.connect}
							</ButtonLink>
						}
					/>
				</div>
			) : null}
			<Columns>
				<Column>
					{file ? (
						<SetupCard id="project" title={p.card}>
							<Fold label={t.extras.project.name} value={draft.name || "-"}>
								<Input
									label={t.extras.project.name}
									value={draft.name}
									onChange={(e) => setDraft({ ...draft, name: e.target.value })}
								/>
							</Fold>
							<ProjectFolder />
							<Fold id="paths" label={p.specs} value={draft.paths.specs ?? ""} mono>
								{Object.keys(draft.paths)
									.filter((k) => k !== "designs")
									.map(pathInput)}
							</Fold>
							<Fold label={p.screens} value={draft.paths.designs ?? ""} mono>
								{pathInput("designs")}
							</Fold>
							<Fold
								id="languages"
								label={p.languagesOf}
								value={picked.join(", ") || t.projects.noConnection}
							>
								{(["docs", "pulls"] as const).map((k) => (
									<Select
										key={k}
										label={t.creator[`${k}Lang`]}
										value={draft.languages[k] || NONE}
										onValueChange={(v) =>
											setDraft({
												...draft,
												languages: { ...draft.languages, [k]: v === NONE ? "" : v },
											})
										}
										items={languageItems(draft.languages[k])}
									/>
								))}
							</Fold>
							<Fold
								id="workflow"
								label={p.recipe}
								value={draft.workflow || t.projects.noConnection}
							>
								<Select
									label={t.projects.workflow}
									value={draft.workflow || NONE}
									onValueChange={(v) => setDraft({ ...draft, workflow: v === NONE ? "" : v })}
									items={[
										{ value: NONE, label: t.projects.noConnection },
										...[...new Set([...(recipes ?? []).map((w) => w.id), draft.workflow])]
											.filter(Boolean)
											.map((id) => ({ value: id, label: id })),
									]}
								/>
							</Fold>
						</SetupCard>
					) : null}
					{file ? (
						<SetupCard id="tickets" title={p.tickets}>
							<SetupRow label={p.ticketsSetup} href="/setup/project?page=tickets" />
							<SetupRow label={p.fields}>
								<ButtonLink href="/setup/project?page=tickets#fields">{p.choose}</ButtonLink>
							</SetupRow>
							<SetupRow label={p.stages}>
								<ButtonLink href="/setup/project?page=tickets#stages">{p.map}</ButtonLink>
							</SetupRow>
						</SetupCard>
					) : null}
					<SetupCard title={t.ui.more}>
						{file ? (
							<>
								<Fold id="more-personas" label={p.personas} value={p.edit}>
									<PersonasEditor />
								</Fold>
								<Fold id="more-profiles" label={p.profiles} value={p.edit}>
									<ProjectOverrides />
								</Fold>
							</>
						) : null}
						<Fold id="overrides" label={p.overridesFor} value={p.edit}>
							{overrideRows}
						</Fold>
						<Fold id="more-import" label={p.import} value={p.importAct}>
							<ProjectImport />
						</Fold>
						{file ? (
							<>
								{connectionPick("tracker")}
								{connectionPick("forge")}
								<Fold id="tracker-scope" label={t.projects.trackerScope} value={draft.scope || "-"}>
									<ScopePicker
										tracker={draft.connections.tracker}
										value={draft.scope}
										onChange={(scope) => setDraft({ ...draft, scope })}
									/>
								</Fold>
								<Fold id="more-repo" label={t.extras.git.title} value={p.edit}>
									<RepoTools />
								</Fold>
								<ProjectDetails>
									<HolidayCountry row />
								</ProjectDetails>
							</>
						) : (
							<Fold id="more-holidays" label={t.costing.plan.country} value={p.edit}>
								<HolidayCountry row />
							</Fold>
						)}
					</SetupCard>
					{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
					{dirty ? (
						<div>
							<RightButton right="project.settings" variant="primary" onClick={save}>
								{t.projects.save}
							</RightButton>
						</div>
					) : null}
				</Column>
				<Column>
					<AgentsAlone />
					<SetupCard id="automation" title={p.automation}>
						<AutoCommit />
						<AutoReview />
						<SetupRow label={p.limit}>
							<ButtonLink href="/crew/spend">
								{limit ? `$${Number(limit).toFixed(2)}` : p.set}
							</ButtonLink>
						</SetupRow>
					</SetupCard>
					<SetupCard>
						<SetupRow label={p.health} href="/setup/project?page=health" />
					</SetupCard>
				</Column>
			</Columns>
		</div>
	);
}

/** One of the connection cards of the top row: the name, the state and one action. A card that must be made has the attention outline. */
function ConnectionCard({
	id,
	title,
	connected,
	attention,
	action,
	children,
}: {
	id?: string;
	title: string;
	connected: boolean;
	attention?: boolean;
	action: React.ReactNode;
	children?: React.ReactNode;
}) {
	const { t } = useI18n();
	const p = t.doctor.project;
	return (
		<section
			id={id}
			aria-label={title}
			className={cn(
				"flex min-w-0 flex-[0_1_280px] flex-col items-start gap-3 rounded-lg bg-surface-2 p-6 shadow-2",
				attention && ATTENTION_FRAME,
			)}
		>
			<h2 className="text-20 font-semibold text-n-12">{title}</h2>
			<Badge variant={connected ? "success" : attention ? "you" : "neutral"} dot={connected}>
				{connected ? p.connected : p.notConnected}
			</Badge>
			{children}
			<div className="w-full">{action}</div>
		</section>
	);
}

/**
 * The project page of Setup / This project: paths and recipe go to `.shipyard/project.yaml`,
 * overrides to the registry. The scope draws the header and the section list.
 */
export function ProjectSettings() {
	const { t } = useI18n();
	const { openFolder } = useProjectActions();
	const settings = useQuery({
		queryKey: projectKeys.settings,
		queryFn: () => unwrap(commands.projectSettings()),
	});
	const data = settings.data;
	if (data === undefined) return null;
	return (
		// A block as tall as its content, so the section list stays in view while the page scrolls.
		<div className="flex flex-col">
			{data ? (
				// A saved file resets the draft.
				<Form key={JSON.stringify(data.file)} file={data.file} overrides={data.overrides} />
			) : (
				<div className="p-4">
					<EmptyState
						title={t.empty.project}
						action={{
							label: t.projects.open,
							icon: <FolderOpenIcon size={14} />,
							onClick: () => void openFolder(),
						}}
					/>
				</div>
			)}
		</div>
	);
}
