import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { DoctorBootstrap } from "@/features/projects/doctor-bootstrap";
import { Columns, SetupCard, SetupRow, Toggle, ValueButton } from "@/features/settings/parts";
import { ButtonLink, Fold } from "@/features/settings/project/fold";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import {
	type CatalogGroup,
	type CatalogUndeployed,
	commands,
	type PluginApplied,
	type PluginChange,
	pickFolder,
	pickPlugin,
	type ChildResult_Serialize as Result,
	type PluginReview_Serialize as Review,
	saveAs,
	unwrap,
	type WriteReport,
} from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { Input } from "@/ui/atoms/input";
import type { Status } from "@/ui/atoms/status-dot";
import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	Cog6ToothIcon,
	FolderOpenIcon,
	PlayIcon,
	PlusIcon,
	TrashIcon,
} from "@/ui/icons";
import { EntryRow } from "@/ui/molecules/entry-row";
import { GroupSection } from "@/ui/molecules/group-section";
import { WriteReportView } from "@/ui/molecules/write-report";
import { CompassSetup } from "./compass-setup";
import { PluginSettings } from "./plugin-settings";

const GROUPS: CatalogGroup[] = ["devcontainers", "agents", "devops-security"];
const CHANGES: PluginChange[] = ["new", "changed", "same", "removed"];
const CHANGE: Record<PluginChange, Status> = {
	new: "info",
	changed: "warning",
	same: "success",
	removed: "danger",
};

/** The files of a component before the deploy, in the inspector. The deploy is one click. */
function ComponentDetail({ id }: { id: string }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const files = useQuery({
		queryKey: ["catalog-preview", id],
		queryFn: () => unwrap(commands.catalogPreview(id)),
	});
	const [done, setDone] = useState<WriteReport | null>(null);
	const [gone, setGone] = useState<CatalogUndeployed | null>(null);
	const state = useQuery({
		queryKey: ["catalog"],
		queryFn: () => unwrap(commands.catalogGet()),
	}).data?.find((c) => c.id === id)?.state;
	return (
		<>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{files.data ? <WriteReportView report={files.data} /> : null}
			<RightButton
				right="project.settings"
				onClick={() =>
					void run(async () => {
						setDone(await unwrap(commands.catalogDeploy(id)));
						await qc.invalidateQueries({ queryKey: ["catalog"] });
					})
				}
			>
				{t.extensions.catalog.deploy}
			</RightButton>
			{done ? <WriteReportView report={done} /> : null}
			{state && state !== "absent" ? (
				<RightButton
					right="project.settings"
					variant="ghost"
					onClick={() =>
						void run(async () => {
							setGone(await unwrap(commands.catalogUndeploy(id, true)));
							setDone(null);
							await qc.invalidateQueries({ queryKey: ["catalog"] });
						})
					}
				>
					<TrashIcon size={14} />
					{t.extensions.catalog.undeploy}
				</RightButton>
			) : null}
			{gone ? (
				<>
					<GroupSection name={t.extensions.catalog.removed} count={gone.removed.length}>
						<ul className="font-mono text-12">
							{gone.removed.map((f) => (
								<li key={f}>{f}</li>
							))}
						</ul>
					</GroupSection>
					{gone.kept.length ? (
						<GroupSection name={t.extensions.catalog.kept} count={gone.kept.length}>
							<ul className="font-mono text-12">
								{gone.kept.map((f) => (
									<li key={f}>{f}</li>
								))}
							</ul>
						</GroupSection>
					) : null}
				</>
			) : null}
		</>
	);
}

/** The entries that a child lacks, in the inspector. */
function ChildDetail({ id }: { id: string }) {
	const { t } = useI18n();
	const children = useQuery({
		queryKey: ["children"],
		queryFn: () => unwrap(commands.childList()),
	});
	const proposed = children.data?.find((c) => c.id === id)?.proposed ?? [];
	return (
		<GroupSection name={t.extensions.children.proposed} count={proposed.length}>
			<ul className="font-mono text-12">
				{proposed.map((k) => (
					<li key={k}>{k}</li>
				))}
			</ul>
		</GroupSection>
	);
}

/** A card with a large bold title, as the design draws the package and send cards. */
function BigCard({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
	return (
		<section
			id={id}
			aria-label={title}
			className="flex min-w-0 flex-col items-start gap-3 rounded-lg bg-surface-2 p-6 shadow-2"
		>
			<h2 className="text-20 font-semibold text-n-12">{title}</h2>
			{children}
		</section>
	);
}

/**
 * Setup / Extensions (`view` "main"): the ways to add a plugin, the installed plugins, the skills, the
 * child projects and the rules setup. Setup / Plugins and rule packs (`view` "plugins"): the review
 * of a plugin, the rule packs, the package and the send to the child projects.
 */
export function Extensions({ view = "main" }: { view?: "main" | "plugins" }) {
	const { t, setPacks } = useI18n();
	const { gate } = useRights();
	const x = t.extensions;
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => unwrap(commands.catalogGet()) });
	const children = useQuery({
		queryKey: ["children"],
		queryFn: () => unwrap(commands.childList()),
	});
	const plugins = useQuery({
		queryKey: ["plugins"],
		queryFn: () => unwrap(commands.pluginList()),
	});
	const { openDetail } = useShell();
	const router = useRouter();
	const compass = useQuery({ queryKey: ["compass"], queryFn: () => unwrap(commands.compassGet()) });

	const [path, setPath] = useState("");
	const [review, setReview] = useState<Review | null>(null);
	const [accepted, setAccepted] = useState<Set<string>>(new Set());
	const [applied, setApplied] = useState<PluginApplied | null>(null);
	/** A manifest fault: the folder, the line and the reason. */
	const [fault, setFault] = useState<{ dir: string; line: number; reason: string } | null>(null);
	const [packaged, setPackaged] = useState("");

	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [chosen, setChosen] = useState<Set<string>>(new Set());
	const [results, setResults] = useState<Result[]>([]);
	const [editing, setEditing] = useState<string | null>(null);
	/** The cloned child projects that lack the plugin. */
	const deployTo = (name: string) =>
		(children.data ?? [])
			.filter((c) => c.cloned && c.proposed.includes(`plugin:${name}`))
			.map((c) => c.id);

	const flip = (set: Set<string>, k: string, on: boolean) => {
		const next = new Set(set);
		if (on) next.add(k);
		else next.delete(k);
		return next;
	};
	const refresh = () => qc.invalidateQueries({ queryKey: ["children"] });

	/** A fault of `manifest.json` shows with its line. Any other error goes to the guard. */
	const keepFault = (e: unknown, dir: string) => {
		const m = /^manifest\.json:(\d+): (.*)$/s.exec((e as { details?: string }).details ?? "");
		if (!m) throw e;
		setReview(null);
		setFault({ dir, line: Number(m[1]), reason: m[2] ?? "" });
	};
	/** Read a zip or a folder and show the review. */
	const look = async (p: string) => {
		setFault(null);
		setPackaged("");
		try {
			const r = await unwrap(commands.pluginReview(p));
			setReview(r);
			setApplied(null);
			setAccepted(
				new Set(
					r.items.filter((i) => i.change === "new" || i.change === "changed").map((i) => i.id),
				),
			);
		} catch (e) {
			keepFault(e, p);
		}
	};
	/** A new plugin: a folder with the files, opened as a project. */
	const newPlugin = async () => {
		const parent = await pickFolder();
		if (!parent) return;
		const dir = await unwrap(commands.pluginNew(parent, true));
		setPath(dir);
		await unwrap(commands.projectsOpen(dir, false));
		await qc.invalidateQueries();
	};
	/** The plugin folder: the path field when it is not a zip, else a pick. */
	const folderOf = async () => {
		const cur = path.trim();
		return cur && !cur.endsWith(".zip") ? cur : pickFolder();
	};

	const d = t.doctor.ext;
	const entryKey = (e: { kind: string; id: string }) => `${e.kind}:${e.id}`;
	const skills = (compass.data?.entries ?? []).filter((e) => e.kind === "skill").slice(0, 5);
	const cloned = (children.data ?? []).filter((c) => c.cloned);
	const fresh = async () => {
		const dir = await pickFolder();
		if (!dir) return;
		setPath(dir);
		await look(dir);
	};
	const errorLine = error ? (
		<p role="alert" className="px-1 text-ui text-danger-text">
			{error}
		</p>
	) : null;

	/** The review of a plugin and what came of its apply: it shows where the plugin was chosen. */
	const reviewBody = (
		<>
			{packaged ? (
				<p role="status" className="px-6 pb-3 text-12 text-n-11">
					{format(x.plugin.packaged, { path: packaged })}
				</p>
			) : null}
			{fault ? (
				<div
					role="alert"
					className="flex flex-wrap items-center gap-2 px-6 pb-3 text-ui text-danger-text"
				>
					<span>
						{format(x.plugin.fault, {
							file: "manifest.json",
							line: String(fault.line),
							reason: fault.reason,
						})}
					</span>
					{fault.dir.endsWith(".zip") ? null : (
						<Button
							variant="ghost"
							onClick={() => void run(() => unwrap(commands.pluginOpenLine(fault.dir, fault.line)))}
						>
							{format(x.plugin.openLine, { file: "manifest.json", line: String(fault.line) })}
						</Button>
					)}
				</div>
			) : null}
			{review
				? CHANGES.map((c) => {
						const rows = review.items.filter((i) => i.change === c);
						const name = c === "new" ? d.adds : c === "changed" ? d.changes : x.plugin.change[c];
						return rows.length ? (
							<GroupSection key={c} name={name} count={rows.length}>
								<ul>
									{rows.map((i) => (
										<EntryRow
											key={i.id}
											name={i.label}
											status={CHANGE[c]}
											statusLabel={name}
											// A removed item is never written: it has nothing to accept.
											check={
												c === "removed"
													? undefined
													: {
															label: format(x.plugin.accept, { name: i.label }),
															checked: accepted.has(i.id),
															onChange: (on) => setAccepted(flip(accepted, i.id, on)),
														}
											}
										>
											<Badge>{i.kind}</Badge>
											{i.preview ? (
												<details className="text-12 text-n-11">
													<summary className="cursor-pointer">
														{format(x.plugin.content, { name: i.label })}
													</summary>
													<pre className="max-h-40 overflow-auto font-mono">{i.preview}</pre>
												</details>
											) : null}
										</EntryRow>
									))}
								</ul>
							</GroupSection>
						) : null;
					})
				: null}
			{review?.refused.length ? (
				<GroupSection name={x.plugin.refused} count={review.refused.length}>
					<ul>
						{review.refused.map((r) => (
							<EntryRow key={r} name={r} status="danger" statusLabel={x.plugin.refused} />
						))}
					</ul>
				</GroupSection>
			) : null}
			{review ? (
				<div className="flex flex-wrap justify-end gap-2.5 px-6 py-3">
					<Button
						variant="secondary"
						onClick={() => {
							setReview(null);
							setAccepted(new Set());
						}}
					>
						{d.refuse}
					</Button>
					<RightButton
						right="project.settings"
						variant="primary"
						disabled={accepted.size === 0}
						onClick={() =>
							void run(async () => {
								setApplied(await unwrap(commands.pluginApply(path.trim(), [...accepted])));
								setReview(null);
								await qc.invalidateQueries({ queryKey: ["catalog"] });
								await qc.invalidateQueries({ queryKey: ["plugins"] });
								await qc.invalidateQueries({ queryKey: ["themes"] });
								setPacks(await unwrap(commands.languageList()));
								await refresh();
							})
						}
					>
						{format(x.plugin.apply, { count: accepted.size })}
					</RightButton>
				</div>
			) : null}
			{applied ? (
				<>
					<WriteReportView report={applied.report} />
					{(
						[
							["mcp", applied.mcpAdded, false],
							["themes", applied.themesAdded, false],
							["themesFailed", applied.themesFailed, true],
							["languages", applied.languagesAdded, false],
							["languagesFailed", applied.languagesFailed, true],
							["mcpFailed", applied.mcpFailed, true],
						] as const
					).map(([key, names, bad]) =>
						names.length ? (
							<p
								key={key}
								role={bad ? "alert" : "status"}
								className={cn("px-6 text-12", bad ? "text-danger-text" : "text-n-11")}
							>
								{format(x.plugin[key], { names: names.join(", ") })}
							</p>
						) : null,
					)}
				</>
			) : null}
		</>
	);
	const reviewShown = !!(review || applied || fault || packaged);

	const sent = results.map((r) => (
		<div key={r.id} className="border-b">
			<p role={r.error ? "alert" : "status"} className="px-6 pt-2 text-ui">
				{r.id}
				{r.error
					? `: ${r.error}`
					: ` ${format(x.children.branch, { branch: r.branch ?? "" })} ${format(x.children.commit, { commit: (r.commit ?? "").slice(0, 7) })}`}
			</p>
			<WriteReportView report={r.report} />
		</div>
	));

	if (view === "plugins")
		return (
			<Columns>
				<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
					{errorLine}
					<SetupCard id="plugin-review" title={review ? undefined : d.review} attention={!!review}>
						{review ? (
							<div className="flex flex-col items-start gap-3 px-6 pt-4">
								<Badge variant="warning">{d.review}</Badge>
								<h2 className="text-20 font-semibold text-n-12">{review.name}</h2>
							</div>
						) : null}
						<Fold id="plugin-source" label={x.plugin.name} value={x.plugin.review}>
							<div className="flex items-end gap-2">
								<Input
									label={x.plugin.path}
									value={path}
									onChange={(e) => setPath(e.target.value)}
								/>
								<Button disabled={!path.trim()} onClick={() => void run(() => look(path.trim()))}>
									<ArrowUpTrayIcon size={14} />
									{x.plugin.review}
								</Button>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									onClick={() =>
										void run(async () => {
											const f = await pickPlugin();
											if (f) setPath(f);
										})
									}
								>
									<FolderOpenIcon size={14} />
									{x.plugin.chooseFile}
								</Button>
								<Button onClick={() => void run(newPlugin)}>
									<PlusIcon size={14} />
									{x.plugin.newPlugin}
								</Button>
								<Button
									onClick={() =>
										void run(async () => {
											const dir = await folderOf();
											if (!dir) return;
											setPath(dir);
											await look(dir);
										})
									}
								>
									<PlayIcon size={14} />
									{x.plugin.tryIn}
								</Button>
							</div>
						</Fold>
						{reviewBody}
					</SetupCard>
					<SetupCard id="rule-packs" title={d.rulePacks}>
						{GROUPS.map((g) =>
							(catalog.data ?? [])
								.filter((c) => c.group === g)
								.map((c) => (
									<SetupRow
										key={c.id}
										label={
											<button
												type="button"
												data-nav=""
												onClick={() => openDetail(c.name, <ComponentDetail key={c.id} id={c.id} />)}
												className="rounded-sm text-left font-semibold hover:underline"
											>
												{c.name}
											</button>
										}
									>
										<Toggle
											label={format(x.plugin.enable, { name: c.name })}
											{...gate("project.settings")}
											checked={c.state !== "absent"}
											onCheckedChange={(on) =>
												void run(async () => {
													if (on) await unwrap(commands.catalogDeploy(c.id));
													else await unwrap(commands.catalogUndeploy(c.id, true));
													await qc.invalidateQueries({ queryKey: ["catalog"] });
												})
											}
										/>
									</SetupRow>
								)),
						)}
					</SetupCard>
				</div>
				<div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
					<BigCard id="plugin-package" title={d.make}>
						<ValueButton
							onClick={() =>
								void run(async () => {
									const dir = await folderOf();
									const dest = dir
										? await saveAs(dir.split(/[\\/]/).pop() || "plugin", "zip")
										: null;
									if (!dir || !dest) return;
									setPath(dir);
									setFault(null);
									try {
										setPackaged(await unwrap(commands.pluginPackage(dir, dest, true)));
									} catch (e) {
										keepFault(e, dir);
									}
								})
							}
						>
							{x.plugin.package}
						</ValueButton>
					</BigCard>
					<BigCard id="plugin-send" title={d.send}>
						{cloned.map((c) => (
							<span key={c.id} className="flex min-h-control items-center gap-3 font-medium">
								<Checkbox
									hideLabel
									label={format(x.children.select, { name: c.name })}
									checked={chosen.has(c.id)}
									onCheckedChange={(on) => setChosen(flip(chosen, c.id, on === true))}
								/>
								{c.name}
							</span>
						))}
						<div>
							<Button
								variant="primary"
								disabled={chosen.size === 0}
								onClick={() =>
									void run(async () => {
										const out: Result[] = [];
										// One call for each child: a child takes only its own proposed keys.
										for (const c of cloned.filter((c) => chosen.has(c.id)))
											out.push(...(await unwrap(commands.childDeploy([c.id], c.proposed))));
										setResults(out);
										await refresh();
									})
								}
							>
								{chosen.size ? format(x.children.deploy, { count: chosen.size }) : d.sendBtn}
							</Button>
						</div>
						{sent}
					</BigCard>
				</div>
			</Columns>
		);

	const tile = "flex min-w-0 flex-col items-start gap-3 rounded-lg bg-surface-2 p-4.5 shadow-2";
	const tileIcon = (icon: ReactNode) => (
		<span className="flex size-12 items-center justify-center rounded-md bg-accent-subtle text-accent-text">
			{icon}
		</span>
	);
	// The rule packs that the project does not hold yet: one tile each, with one Add.
	const offered = (catalog.data ?? []).filter((c) => c.state === "absent").slice(0, 3);
	const compassSet = (compass.data?.entries ?? []).some((e) => e.state === "current");
	const grid =
		"grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-start gap-6 px-4";
	return (
		<div className="flex flex-col gap-4 pb-10">
			{errorLine}
			<h2 className="px-4 text-20 font-semibold text-n-12">{d.add}</h2>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3.5 px-4">
				{offered.map((c) => (
					<section key={c.id} aria-label={c.name} className={tile}>
						{tileIcon(<PlusIcon size={20} />)}
						<span className="text-20 font-semibold text-n-12">{c.name}</span>
						<Button
							variant="secondary"
							className="w-full"
							aria-label={format(x.plugin.enable, { name: c.name })}
							onClick={() =>
								void run(async () => {
									await unwrap(commands.catalogDeploy(c.id));
									await qc.invalidateQueries({ queryKey: ["catalog"] });
								})
							}
						>
							{d.addBtn}
						</Button>
					</section>
				))}
				<section id="plugin-add" aria-label={d.folder} className={tile}>
					{tileIcon(<PlusIcon size={20} />)}
					<span className="text-20 font-semibold text-n-12">{d.folder}</span>
					<Button variant="secondary" className="w-full" onClick={() => void run(fresh)}>
						{d.choose}
					</Button>
				</section>
			</div>
			<div className="px-4">
				<Fold id="plugin-add-more" label={t.ui.more} value={d.zip}>
					<div className="flex flex-wrap items-center gap-3">
						<span className="font-semibold">{d.zip}</span>
						<ValueButton
							onClick={() =>
								void run(async () => {
									const f = await pickPlugin();
									if (!f) return;
									setPath(f);
									await look(f);
								})
							}
						>
							{d.choose}
						</ValueButton>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<span className="font-semibold">{d.fresh}</span>
						<ValueButton
							onClick={() =>
								void run(async () => {
									await newPlugin();
									router.history.push("/setup/project?page=plugins");
								})
							}
						>
							{d.create}
						</ValueButton>
					</div>
				</Fold>
			</div>
			{reviewShown ? (
				<div className="px-4">
					<SetupCard>{reviewBody}</SetupCard>
				</div>
			) : null}
			<div className={grid}>
				<SetupCard id="extensions-installed" title={d.installed}>
					{(plugins.data ?? []).map((p) => (
						<div key={p.name}>
							<SetupRow label={p.name}>
								<Toggle
									label={format(x.plugin.enable, { name: p.name })}
									{...gate("project.settings")}
									checked={p.enabled}
									onCheckedChange={(on) =>
										void run(async () => {
											await unwrap(commands.pluginSetEnabled(p.name, on, true));
											await qc.invalidateQueries({ queryKey: ["plugins"] });
											await refresh();
										})
									}
								/>
							</SetupRow>
							<details className="px-6 pb-2">
								<summary className="min-h-control cursor-pointer text-12 text-n-11">
									{t.ui.more} {p.version}
								</summary>
								<div className="flex flex-wrap items-center gap-2">
									{p.settings.length ? (
										<Button
											variant="ghost"
											aria-expanded={editing === p.name}
											aria-label={format(x.plugin.settingsName, { name: p.name })}
											onClick={() => setEditing(editing === p.name ? null : p.name)}
										>
											<Cog6ToothIcon size={14} />
											{x.plugin.settings}
										</Button>
									) : null}
									<Button
										variant="ghost"
										disabled={!p.enabled || !deployTo(p.name).length}
										reason={p.enabled ? x.plugin.deployNone : x.plugin.deployOff}
										aria-label={format(x.plugin.deployName, { name: p.name })}
										onClick={() =>
											void run(async () => {
												const key = `plugin:${p.name}`;
												setResults(await unwrap(commands.childDeploy(deployTo(p.name), [key])));
												await refresh();
											})
										}
									>
										<ArrowUpTrayIcon size={14} />
										{x.plugin.deploy}
									</Button>
									<RightButton
										right="project.settings"
										variant="ghost"
										aria-label={format(x.plugin.removeName, { name: p.name })}
										onClick={() =>
											void run(async () => {
												await unwrap(commands.pluginRemove(p.name, true));
												await qc.invalidateQueries({ queryKey: ["plugins"] });
												await refresh();
												await qc.invalidateQueries({ queryKey: ["catalog"] });
											})
										}
									>
										<TrashIcon size={14} />
										{x.plugin.remove}
									</RightButton>
								</div>
							</details>
							{editing === p.name ? (
								<PluginSettings
									name={p.name}
									// The files that the new values change show in the same review.
									onSaved={() => {
										const src = p.source;
										if (!src) return;
										setPath(src);
										void run(() => look(src));
									}}
								/>
							) : null}
						</div>
					))}
					{sent}
				</SetupCard>
				<SetupCard id="extensions-children" title={d.children}>
					{(children.data ?? []).map((c) => (
						<div key={c.id}>
							<SetupRow label={c.name}>
								<ValueButton
									onClick={() => openDetail(c.name, <ChildDetail key={c.id} id={c.id} />)}
									aria-label={format(d.openChild, { name: c.name })}
								>
									{d.openChild}
								</ValueButton>
							</SetupRow>
							<details className="px-6 pb-2">
								<summary className="min-h-control cursor-pointer text-12 text-n-11">
									{t.ui.more}
								</summary>
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant={c.cloned && c.held === c.total ? "success" : "neutral"}>
										{format(x.children.held, { held: c.held, total: c.total })}
									</Badge>
									{c.cloned ? null : (
										<Button
											aria-label={format(x.children.cloneName, { name: c.name })}
											onClick={() =>
												void run(async () => {
													await unwrap(commands.childClone(c.id));
													await refresh();
												})
											}
										>
											<ArrowDownTrayIcon size={14} />
											{x.children.clone}
										</Button>
									)}
									<Button
										variant="ghost"
										aria-label={format(x.children.removeName, { name: c.name })}
										onClick={() =>
											void run(async () => {
												await unwrap(commands.childRemove(c.id));
												setChosen(flip(chosen, c.id, false));
												await refresh();
											})
										}
									>
										<TrashIcon size={14} />
										{x.children.remove}
									</Button>
								</div>
							</details>
						</div>
					))}
					<details id="child-add" className="border-n-6 border-t">
						<summary className="flex min-h-15 cursor-pointer list-none items-center px-6 font-semibold text-accent-text [&::-webkit-details-marker]:hidden">
							{d.addChild}
						</summary>
						<div className="flex flex-col gap-3 px-6 pt-1 pb-5">
							<Input
								label={x.children.nameField}
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
							<Input label={x.children.url} value={url} onChange={(e) => setUrl(e.target.value)} />
							<div>
								<Button
									disabled={!name.trim() || !url.trim()}
									onClick={() =>
										void run(async () => {
											await unwrap(commands.childAdd(name, url));
											setName("");
											setUrl("");
											await refresh();
										})
									}
								>
									<PlusIcon size={14} />
									{x.children.add}
								</Button>
							</div>
						</div>
					</details>
				</SetupCard>
				{skills.length ? (
					<SetupCard id="extensions-skills" title={d.skills}>
						{skills.slice(0, 3).map((e) => (
							<SetupRow key={e.id} label={e.title}>
								<Toggle
									label={e.title}
									{...gate("project.settings")}
									checked={e.state === "current"}
									onCheckedChange={(on) =>
										void run(async () => {
											if (on) await unwrap(commands.compassApply([entryKey(e)]));
											else await unwrap(commands.compassRemove(e.kind, e.id, true));
											await qc.invalidateQueries({ queryKey: ["compass"] });
										})
									}
								/>
							</SetupRow>
						))}
						<div className="flex min-h-15 items-center justify-center border-n-6 border-t">
							<ButtonLink
								href="/setup/computer?page=rules"
								className="border-0 bg-transparent text-accent-text shadow-none hover:bg-transparent"
							>
								{d.allSkills}
							</ButtonLink>
						</div>
					</SetupCard>
				) : null}
				<SetupCard id="rules-setup" title={d.rules}>
					<Fold
						id="rules-here"
						label={d.rulesHere}
						value={compassSet ? <Badge variant="success">{d.setUp}</Badge> : d.setUp}
						plain={compassSet}
					>
						<CompassSetup />
					</Fold>
					<Fold id="rules-copy" label={d.rulesCopy} value={d.setUp}>
						<DoctorBootstrap />
					</Fold>
					<SetupRow label={d.rulesUpdate}>
						<ButtonLink href="/setup/computer?page=rules">{d.check}</ButtonLink>
					</SetupRow>
				</SetupCard>
			</div>
			<div className="px-4">
				<SetupCard>
					<SetupRow label={d.packs} href="/setup/project?page=plugins" />
				</SetupCard>
			</div>
		</div>
	);
}
