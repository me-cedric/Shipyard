import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import {
	type CatalogGroup,
	type CatalogUndeployed,
	commands,
	type PluginApplied,
	type PluginChange,
	type ChildResult_Serialize as Result,
	type PluginReview_Serialize as Review,
	type SyncState,
	unwrap,
	type WriteReport,
} from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { Switch } from "@/ui/atoms/switch";
import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	Cog6ToothIcon,
	PlusIcon,
	PuzzlePieceIcon,
	TrashIcon,
} from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { EntryRow } from "@/ui/molecules/entry-row";
import { GroupSection } from "@/ui/molecules/group-section";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { WriteReportView } from "@/ui/molecules/write-report";
import { PluginSettings } from "./plugin-settings";

const GROUPS: CatalogGroup[] = ["devcontainers", "agents", "devops-security"];
const CHANGES: PluginChange[] = ["new", "changed", "same", "removed"];
const SYNC: Record<SyncState, Status> = { current: "success", stale: "warning", absent: "idle" };
/** The tint of the glyph tile of a catalog card, from its state. */
const GLYPH: Record<SyncState, string> = {
	current: "bg-success-soft text-success-text",
	stale: "bg-warning-soft text-warning-text",
	absent: "bg-n-3 text-n-11",
};
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
			<Button
				onClick={() =>
					void run(async () => {
						setDone(await unwrap(commands.catalogDeploy(id)));
						await qc.invalidateQueries({ queryKey: ["catalog"] });
					})
				}
			>
				{t.extensions.catalog.deploy}
			</Button>
			{done ? <WriteReportView report={done} /> : null}
			{state && state !== "absent" ? (
				<Button
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
				</Button>
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

/**
 * Settings / Extensions: the catalog, the plugin import with its review, the typed settings and the
 * deploy of an applied plugin, and the child projects.
 */
export function Extensions() {
	const { t } = useI18n();
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

	const [path, setPath] = useState("");
	const [review, setReview] = useState<Review | null>(null);
	const [accepted, setAccepted] = useState<Set<string>>(new Set());
	const [applied, setApplied] = useState<PluginApplied | null>(null);

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

	return (
		<div className="flex flex-col">
			<PageHeader
				icon={<PuzzlePieceIcon size={16} />}
				title={t.tabs.settings.extensions}
				count={catalog.data?.length}
			/>
			<div className="flex max-w-4xl flex-col gap-4 px-4 pt-1 pb-4">
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}

				<div className="grid gap-4 lg:grid-cols-3">
					{GROUPS.map((g) => {
						const rows = (catalog.data ?? []).filter((c) => c.group === g);
						return (
							<GroupSection key={g} name={x.catalog.groups[g]} count={rows.length}>
								<ul className="flex flex-col gap-2 pt-1">
									{rows.map((c) => (
										<li key={c.id}>
											<Card className="flex items-center gap-3 p-3">
												<span
													aria-hidden="true"
													className={cn(
														"flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-16",
														GLYPH[c.state],
													)}
												>
													{c.name.slice(0, 1).toUpperCase()}
												</span>
												<span className="flex min-w-0 flex-1 flex-col gap-1">
													<button
														type="button"
														data-nav=""
														onClick={() =>
															openDetail(c.name, <ComponentDetail key={c.id} id={c.id} />)
														}
														className="truncate rounded-sm text-left text-ui font-medium text-n-12 hover:underline"
													>
														{c.name}
													</button>
													<span className="flex items-center gap-2 text-12 text-n-11">
														<StatusDot
															status={SYNC[c.state]}
															label={t.extensions.compass.state[c.state]}
														/>
														<span aria-hidden="true">{t.extensions.compass.state[c.state]}</span>
														<Badge className="ml-auto font-mono">{c.version}</Badge>
													</span>
												</span>
											</Card>
										</li>
									))}
								</ul>
							</GroupSection>
						);
					})}
				</div>

				<Panel
					title={x.plugin.name}
					count={review?.items.length ?? 0}
					icon={<ArrowUpTrayIcon size={14} />}
					flush
				>
					<div className="flex items-end gap-2 p-3">
						<Input label={x.plugin.path} value={path} onChange={(e) => setPath(e.target.value)} />
						<Button
							disabled={!path.trim()}
							onClick={() =>
								void run(async () => {
									const r = await unwrap(commands.pluginReview(path.trim()));
									setReview(r);
									setApplied(null);
									setAccepted(
										new Set(
											r.items
												.filter((i) => i.change === "new" || i.change === "changed")
												.map((i) => i.id),
										),
									);
								})
							}
						>
							<ArrowUpTrayIcon size={14} />
							{x.plugin.review}
						</Button>
					</div>
					{review
						? CHANGES.map((c) => {
								const rows = review.items.filter((i) => i.change === c);
								return rows.length ? (
									<GroupSection key={c} name={x.plugin.change[c]} count={rows.length}>
										<ul>
											{rows.map((i) => (
												<EntryRow
													key={i.id}
													name={i.label}
													status={CHANGE[c]}
													statusLabel={x.plugin.change[c]}
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
						<div className="p-3">
							<Button
								disabled={accepted.size === 0}
								onClick={() =>
									void run(async () => {
										setApplied(await unwrap(commands.pluginApply(path.trim(), [...accepted])));
										setReview(null);
										await qc.invalidateQueries({ queryKey: ["catalog"] });
										await qc.invalidateQueries({ queryKey: ["plugins"] });
										await refresh();
									})
								}
							>
								{format(x.plugin.apply, { count: accepted.size })}
							</Button>
						</div>
					) : null}
					{applied ? (
						<>
							<WriteReportView report={applied.report} />
							{applied.mcpAdded.length ? (
								<p role="status" className="px-3 text-12 text-n-11">
									{format(x.plugin.mcp, { names: applied.mcpAdded.join(", ") })}
								</p>
							) : null}
							{applied.mcpFailed.length ? (
								<p role="alert" className="px-3 text-12 text-danger-text">
									{format(x.plugin.mcpFailed, { names: applied.mcpFailed.join(", ") })}
								</p>
							) : null}
						</>
					) : null}
				</Panel>

				<Panel title={x.plugin.installed} count={plugins.data?.length ?? 0} flush>
					{(plugins.data ?? []).map((p) => (
						<div key={p.name}>
							<SettingsRow label={`${p.name} ${p.version}`}>
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
								<Switch
									label={format(x.plugin.enable, { name: p.name })}
									iconOnly
									checked={p.enabled}
									onCheckedChange={(on) =>
										void run(async () => {
											await unwrap(commands.pluginSetEnabled(p.name, on, true));
											await qc.invalidateQueries({ queryKey: ["plugins"] });
											await refresh();
										})
									}
								/>
								<Button
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
								</Button>
							</SettingsRow>
							{editing === p.name ? <PluginSettings name={p.name} /> : null}
						</div>
					))}
				</Panel>

				<Panel
					title={x.children.name}
					count={children.data?.length ?? 0}
					icon={<ArrowDownTrayIcon size={14} />}
					flush
				>
					<div className="flex items-end gap-2 p-3">
						<Input
							label={x.children.nameField}
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<Input label={x.children.url} value={url} onChange={(e) => setUrl(e.target.value)} />
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
					<ul>
						{(children.data ?? []).map((c) => (
							<EntryRow
								key={c.id}
								name={c.name}
								status={c.cloned ? (c.held === c.total ? "success" : "warning") : "idle"}
								statusLabel={format(x.children.held, { held: c.held, total: c.total })}
								onOpen={() => openDetail(c.name, <ChildDetail key={c.id} id={c.id} />)}
								check={
									c.cloned
										? {
												label: format(x.children.select, { name: c.name }),
												checked: chosen.has(c.id),
												onChange: (on) => setChosen(flip(chosen, c.id, on)),
											}
										: undefined
								}
							>
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
							</EntryRow>
						))}
					</ul>
					<div className="p-3">
						<Button
							variant="primary"
							disabled={chosen.size === 0}
							onClick={() =>
								void run(async () => {
									const out: Result[] = [];
									// One call for each child: a child takes only its own proposed keys.
									for (const c of (children.data ?? []).filter((c) => chosen.has(c.id)))
										out.push(...(await unwrap(commands.childDeploy([c.id], c.proposed))));
									setResults(out);
									await refresh();
								})
							}
						>
							{format(x.children.deploy, { count: chosen.size })}
						</Button>
					</div>
					{results.map((r) => (
						<div key={r.id} className="border-b">
							<p role={r.error ? "alert" : "status"} className="px-3 pt-2 text-ui">
								{r.id}
								{r.error
									? `: ${r.error}`
									: ` ${format(x.children.branch, { branch: r.branch ?? "" })} ${format(x.children.commit, { commit: (r.commit ?? "").slice(0, 7) })}`}
							</p>
							<WriteReportView report={r.report} />
						</div>
					))}
				</Panel>
			</div>
		</div>
	);
}
