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
import { projectKeys, useProjectActions } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { Cog6ToothIcon, FolderOpenIcon, SunIcon, SwatchIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Settings } from "@/ui/templates/settings";

const NONE = "none";
const ACCENTS: Accent[] = ["blue", "violet", "green", "orange", "rose"];

type Draft = { paths: Record<string, string>; workflow: string };

const draftOf = (f: ProjectFile_Deserialize | null): Draft => ({
	paths: { ...f?.paths },
	workflow: f?.defaultWorkflow ?? "",
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
					paths: draft.paths,
					defaultWorkflow: draft.workflow.trim() || null,
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
									rows: Object.keys(draft.paths)
										.sort()
										.map((kind) => ({
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
