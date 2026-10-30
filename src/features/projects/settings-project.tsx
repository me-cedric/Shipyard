import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { Cog6ToothIcon, FolderOpenIcon, LinkIcon, SunIcon, SwatchIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Settings } from "@/ui/templates/settings";
import { ProjectImport } from "./project-import";
import { PersonasEditor } from "./personas";
import { ProjectDetails } from "./project-details";
import { TicketsConfigEditor } from "./tickets-config";

const NONE = "none";
const ACCENTS: Accent[] = ["blue", "violet", "green", "orange", "rose"];

type Draft = {
	paths: Record<string, string>;
	workflow: string;
	/** The connection id for each purpose. Empty is none. */
	connections: { tracker: string; forge: string };
	/** The Jira project key, the repository, the Azure project or the Linear team. */
	scope: string;
};

const draftOf = (f: ProjectFile_Deserialize | null): Draft => ({
	// Every key shows: a key that the file does not set shows its default.
	paths: { ...PATH_DEFAULTS, ...f?.paths },
	workflow: f?.defaultWorkflow ?? "",
	connections: { tracker: f?.connections?.tracker ?? "", forge: f?.connections?.forge ?? "" },
	scope: f?.connections?.trackerScope ?? "",
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
	// The same query as Settings / Connections: one cache.
	const connections = useQuery({
		queryKey: ["connections", "list"],
		queryFn: () => unwrap(commands.connectionsList()),
	}).data;
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
	const [error, setError] = useState<string | null>(null);
	const saved = draftOf(file);
	const dirty = file !== null && JSON.stringify(draft) !== JSON.stringify(saved);

	const save = async () => {
		if (!file) return;
		try {
			setError(null);
			await unwrap(
				commands.projectFileSave({
					...file,
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
				}),
			);
			await qc.invalidateQueries();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	// An override goes to the registry at once. It never reaches the repository.
	const setOverride = async (patch: Partial<Overrides_Serialize>) => {
		await unwrap(commands.projectOverridesSave({ ...overrides, ...patch }));
		await qc.invalidateQueries();
	};
	const override = <K extends keyof Overrides_Serialize>(
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

	return (
		<div className="flex flex-col gap-4 p-4">
			<Settings
				sections={[
					...(file
						? [
								{
									id: "paths",
									title: t.projects.paths,
									rows: Object.keys(draft.paths).map((kind) => ({
										id: kind,
										icon: <FolderOpenIcon size={14} />,
										label: (t.projects.path as Record<string, string>)[kind] ?? kind,
										control: (
											<Input
												label={(t.projects.path as Record<string, string>)[kind] ?? kind}
												value={draft.paths[kind] ?? ""}
												onChange={(e) =>
													setDraft({
														...draft,
														paths: { ...draft.paths, [kind]: e.target.value },
													})
												}
												className="w-64"
											/>
										),
									})),
								},
								{
									id: "connections",
									title: t.projects.connections,
									rows: [
										...(["tracker", "forge"] as const).map((group) => ({
											id: group,
											icon: <LinkIcon size={14} />,
											label: t.connections.type[group],
											control: (
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
											),
										})),
										{
											id: "scope",
											icon: <LinkIcon size={14} />,
											label: t.projects.trackerScope,
											control: (
												<Input
													label={t.projects.trackerScope}
													value={draft.scope}
													onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
													className="w-64"
												/>
											),
										},
									],
								},
								{
									id: "workflow",
									title: t.projects.workflow,
									rows: [
										{
											id: "workflow",
											icon: <Cog6ToothIcon size={14} />,
											label: t.projects.workflow,
											control: (
												<Input
													label={t.projects.workflow}
													value={draft.workflow}
													onChange={(e) => setDraft({ ...draft, workflow: e.target.value })}
													className="w-64"
												/>
											),
										},
									],
								},
							]
						: []),
					{
						id: "overrides",
						title: t.projects.overrides,
						rows: [
							override(
								"theme",
								t.prefs.theme,
								<SunIcon size={14} />,
								(["light", "dark", "system"] as Theme[]).map((v) => ({
									value: v,
									label: t.theme[v],
								})),
							),
							override(
								"density",
								t.prefs.density,
								<Cog6ToothIcon size={14} />,
								(["default", "compact"] as Density[]).map((v) => ({
									value: v,
									label: v === "compact" ? t.prefs.compact : t.projects.noOverride,
								})),
							),
							override(
								"contrast",
								t.prefs.contrast,
								<Cog6ToothIcon size={14} />,
								(["default", "high"] as Contrast[]).map((v) => ({
									value: v,
									label: v === "high" ? t.prefs.contrast : t.projects.noOverride,
								})),
							),
							override(
								"accent",
								t.projects.accent,
								<SwatchIcon size={14} />,
								ACCENTS.map((v) => ({ value: v, label: t.projects.accents[v] })),
							),
						],
					},
				]}
			/>
			{file ? (
				<>
					<ProjectDetails />
					<TicketsConfigEditor />
					<PersonasEditor />
				</>
			) : null}
			<ProjectImport />
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{dirty ? (
				<div>
					<Button variant="primary" onClick={save}>
						{t.projects.save}
					</Button>
				</div>
			) : null}
		</div>
	);
}

/** Settings / Project: paths and workflow go to `.shipyard/project.yaml`, overrides to the registry. */
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
		<>
			<h1 className="sr-only">{t.tabs.settings.project}</h1>
			{data ? (
				// A saved file resets the draft.
				<Form key={JSON.stringify(data.file)} file={data.file} overrides={data.overrides} />
			) : (
				<div className="p-4">
					<EmptyState
						action={{
							label: t.projects.open,
							icon: <FolderOpenIcon size={14} />,
							onClick: () => void openFolder(),
						}}
					/>
				</div>
			)}
		</>
	);
}
