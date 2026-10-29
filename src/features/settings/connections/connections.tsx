import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import {
	type Connection_Serialize,
	type ConnectionGroup,
	type ConnectionState,
	commands,
	type TestOutcome,
	unwrap,
} from "@/lib/ipc";
import { copyText, useMenus } from "@/lib/menus";
import { useBacklinks } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { clock, useSyncState } from "@/lib/sync";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Select } from "@/ui/atoms/select";
import type { Status } from "@/ui/atoms/status-dot";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowPathIcon, Cog6ToothIcon, FolderOpenIcon, PlusIcon, XMarkIcon } from "@/ui/icons";
import { BacklinkList } from "@/ui/molecules/backlink-list";
import { ConnectionRow } from "@/ui/molecules/connection-row";
import { EmptyState } from "@/ui/molecules/empty-state";
import { FlagList } from "@/ui/molecules/flag-list";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { SyncStatus } from "@/ui/molecules/sync-status";
import { ADD_TYPES, type AddType, ConnectionForm, GROUPS } from "./connection-form";
import { connectionKeys, message, useMcpServers, useProviders } from "./keys";
import { McpAddForm, McpGroup } from "./mcp-group";
import { ProviderForm, ProvidersGroup } from "./providers-group";
import { RunnersGroup } from "./runners-group";

const STATE_SHAPE: Record<ConnectionState, Status> = {
	untested: "idle",
	passed: "success",
	failed: "danger",
};

/** Shape and colour of the sync state. A connection that never synced shows the dash. */
const SYNC_SHAPE = { idle: "success", running: "active", failed: "danger" } as const;

const FLAGS = [
	"hierarchy",
	"transitions",
	"labels",
	"comments",
	"timeTracking",
	"assignee",
] as const;

function Repos({ id }: { id: string }) {
	const { t } = useI18n();
	const repos = useQuery({
		queryKey: connectionKeys.repos(id),
		queryFn: () => unwrap(commands.connectionsRepos(id, null)),
	});
	if (repos.error)
		return (
			<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
				{message(repos.error)}
			</p>
		);
	const items = repos.data?.items ?? [];
	return (
		<section aria-label={t.connections.repos} className="px-3 pb-2">
			<h3 className="py-1 text-12 font-medium text-n-11">
				{format(t.count, { name: t.connections.repos, count: items.length })}
			</h3>
			{items.map((r) => (
				<SettingsRow key={r.slug} icon={<FolderOpenIcon size={14} />} label={r.slug}>
					{r.canPush === false ? <Badge variant="warning">{t.connections.noPush}</Badge> : null}
				</SettingsRow>
			))}
		</section>
	);
}

/** The entities that cite the connection, then the confirm. */
function RemovePanel({ id, onDone }: { id: string; onDone: () => void }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { openRef } = useShell();
	const backlinks = useBacklinks(`conn:${id}`);
	const cited = backlinks.data ?? [];
	// Every registered project that names the connection in its `.shipyard/project.yaml`, not
	// only the active one. A cached list is not trusted: the confirm waits for a fresh one.
	const users = useQuery({
		queryKey: connectionKeys.users(id),
		queryFn: () => unwrap(commands.connectionsUsers(id)),
		gcTime: 0,
	});
	const ready = users.isSuccess && !users.isFetching && !backlinks.isLoading;
	const uses = users.data?.length
		? [
				...cited,
				{
					kind: "project",
					items: users.data.map((p) => ({
						source: `project:${p.key.toLowerCase()}`,
						title: p.name,
					})),
				},
			]
		: cited;
	const [error, setError] = useState<string | null>(null);
	const confirm = async () => {
		try {
			setError(null);
			await unwrap(commands.connectionsRemove(id));
			await qc.invalidateQueries();
		} catch (e) {
			setError(message(e));
		}
	};
	return (
		<div className="flex flex-col gap-2 px-3 pb-2">
			<BacklinkList
				groups={uses.map((g) => ({
					kind: g.kind,
					items: g.items.map((i) => ({ ref: i.source, title: i.title })),
				}))}
				onOpen={openRef}
			/>
			{error || users.error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error ?? message(users.error)}
				</p>
			) : null}
			<div className="flex gap-2">
				<Button variant="danger" disabled={!ready} onClick={confirm}>
					{t.connections.confirm}
				</Button>
				<Button variant="ghost" onClick={onDone}>
					{t.connections.cancel}
				</Button>
			</div>
		</div>
	);
}

type Panel = "edit" | "repos" | "remove" | null;

function Row({
	connection: c,
	formOpen,
	onForm,
}: {
	connection: Connection_Serialize;
	/** Another form is open: this row cannot open its edit form. */
	formOpen: boolean;
	onForm: (open: boolean) => void;
}) {
	const { t, lang } = useI18n();
	const qc = useQueryClient();
	const sync = useSyncState().data?.find((x) => x.id === c.id);
	const [panel, setPanel] = useState<Panel>(null);
	const [result, setResult] = useState<TestOutcome | null>(null);
	const [testing, setTesting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const menu = useMenus();

	const show = (p: Panel) => {
		const next = panel === p ? null : p;
		setPanel(next);
		onForm(next === "edit");
	};

	const test = async () => {
		setTesting(true);
		setError(null);
		try {
			setResult(await unwrap(commands.connectionsTest(c.id)));
		} catch (e) {
			setError(message(e));
		} finally {
			setTesting(false);
			await qc.invalidateQueries({ queryKey: connectionKeys.list });
		}
	};

	const text = result
		? format(t.connections.result[result.kind], {
				account: result.kind === "passed" ? result.account : "",
				scope: result.kind === "missing-scope" ? result.scope : "",
				reason: result.kind === "failed" ? result.reason : "",
			})
		: null;

	return (
		<ConnectionRow
			menu={menu("connection", {
				test: () => void test(),
				edit: () => show("edit"),
				remove: () => show("remove"),
				"copy-ref": () => copyText(`conn:${c.id}`),
			})}
			status={STATE_SHAPE[c.state]}
			statusLabel={t.connections.state[c.state]}
			name={c.name}
			product={(t.connections.kind[c.group] as Record<string, string>)[c.kind] ?? c.kind}
			flags={
				c.capabilities ? (
					<FlagList
						label={t.connections.flags}
						onLabel={t.connections.on}
						offLabel={t.connections.off}
						flags={FLAGS.map((f) => ({
							id: f,
							label: t.connections.flag[f],
							on: c.capabilities?.[f] ?? false,
						}))}
					/>
				) : undefined
			}
			actions={
				<>
					<IconButton label={t.connections.test} disabled={testing} onClick={test}>
						<ArrowPathIcon size={14} />
					</IconButton>
					<IconButton
						label={t.connections.edit}
						disabled={formOpen && panel !== "edit"}
						onClick={() => show("edit")}
					>
						<Cog6ToothIcon size={14} />
					</IconButton>
					{c.group === "forge" ? (
						<IconButton label={t.connections.repos} onClick={() => show("repos")}>
							<FolderOpenIcon size={14} />
						</IconButton>
					) : null}
					<IconButton label={t.connections.remove} onClick={() => show("remove")}>
						<XMarkIcon size={14} />
					</IconButton>
				</>
			}
		>
			{sync ? (
				<SyncStatus
					status={sync.status === "idle" && sync.lastOk === null ? "idle" : SYNC_SHAPE[sync.status]}
					label={t.sync.state[sync.status]}
					time={sync.lastOk === null ? undefined : clock(sync.lastOk, lang)}
					dateTime={sync.lastOk === null ? undefined : new Date(sync.lastOk * 1000).toISOString()}
					detail={sync.error ?? undefined}
				/>
			) : null}
			{result && text ? (
				<p role="status" className="flex items-center gap-2 px-3 pb-2 text-ui">
					<StatusDot
						status={result.kind === "passed" ? "success" : "danger"}
						label={t.connections.state[result.kind === "passed" ? "passed" : "failed"]}
					/>
					{text}
				</p>
			) : null}
			{error ? (
				<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{panel === "edit" ? (
				<ConnectionForm
					connection={c}
					onDone={() => {
						setPanel(null);
						setResult(null);
						onForm(false);
					}}
				/>
			) : null}
			{panel === "repos" ? <Repos id={c.id} /> : null}
			{panel === "remove" ? <RemovePanel id={c.id} onDone={() => show("remove")} /> : null}
		</ConnectionRow>
	);
}

/** The form of a tracker or a forge, or of a type that has its own form. Runners need none. */
function AddForm({ onDone }: { onDone: () => void }) {
	const { t } = useI18n();
	const [type, setType] = useState<AddType>("tracker");
	if (type === "tracker" || type === "forge")
		return <ConnectionForm initialGroup={type} onType={setType} onDone={onDone} />;
	return (
		<div>
			<SettingsRow label={t.connections.field.type}>
				<Select
					label={t.connections.field.type}
					value={type}
					onValueChange={(v) => setType(v as AddType)}
					items={ADD_TYPES.map((v) => ({ value: v, label: t.connections.type[v] }))}
				/>
			</SettingsRow>
			{type === "mcp" ? <McpAddForm onDone={onDone} /> : <ProviderForm onDone={onDone} />}
		</div>
	);
}

/** Settings / Connections: one list grouped by kind, and one primary action: add a connection. */
export function Connections() {
	const { t } = useI18n();
	const list = useQuery({
		queryKey: connectionKeys.list,
		queryFn: () => unwrap(commands.connectionsList()),
	});
	const [adding, setAdding] = useState(false);
	const [editing, setEditing] = useState(false);
	const conns = list.data;
	const mcpCount = (useMcpServers().data ?? []).filter((m) => m.enabled).length;
	const providerCount = (useProviders().data ?? []).length;
	if (conns === undefined && !list.error) return null;
	const formOpen = adding || editing;
	const add = {
		label: t.connections.add,
		icon: <PlusIcon size={14} />,
		onClick: () => setAdding(true),
	};
	// The runners are not added by a person: they do not count.
	const empty = (conns ?? []).length + mcpCount + providerCount === 0 && !adding;
	return (
		<div className="flex max-w-2xl flex-col gap-6 p-4">
			<h1 className="sr-only">{t.tabs.settings.connections}</h1>
			{list.error ? (
				<p role="alert" className="text-ui text-danger-text">
					{message(list.error)}
				</p>
			) : null}
			{empty ? (
				<EmptyState action={add} />
			) : (
				<div>
					<Button
						variant={formOpen ? "secondary" : "primary"}
						disabled={adding}
						onClick={add.onClick}
					>
						{add.icon}
						{add.label}
					</Button>
				</div>
			)}
			{adding ? <AddForm onDone={() => setAdding(false)} /> : null}
			{GROUPS.map((g: ConnectionGroup) => {
				const rows = (conns ?? []).filter((c) => c.group === g);
				if (rows.length === 0) return null;
				return (
					<section key={g} aria-labelledby={`connections-${g}`}>
						<h2 id={`connections-${g}`} className="px-3 py-1 text-12 font-medium text-n-11">
							{format(t.count, { name: t.connections.group[g], count: rows.length })}
						</h2>
						{rows.map((c) => (
							<Row key={c.id} connection={c} formOpen={formOpen} onForm={setEditing} />
						))}
					</section>
				);
			})}
			<McpGroup formOpen={formOpen} onForm={setEditing} />
			<RunnersGroup />
			<ProvidersGroup formOpen={formOpen} onForm={setEditing} />
		</div>
	);
}
