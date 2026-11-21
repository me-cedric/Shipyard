import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { classify, errorMessage } from "@/lib/i18n/errors";
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
import { RightButton } from "@/lib/rights";
import { askForm, useFormIntent, useShell } from "@/lib/shell";
import { clock, syncKeys, useSyncState } from "@/lib/sync";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import type { Status } from "@/ui/atoms/status-dot";
import { StatusDot } from "@/ui/atoms/status-dot";
import {
	ArrowPathIcon,
	ArrowsRightLeftIcon,
	CodeBracketIcon,
	Cog6ToothIcon,
	CpuChipIcon,
	FolderOpenIcon,
	InboxIcon,
	LinkIcon,
	LockClosedIcon,
	PlusIcon,
	PuzzlePieceIcon,
	SparklesIcon,
	XMarkIcon,
} from "@/ui/icons";
import { BacklinkList } from "@/ui/molecules/backlink-list";
import { ConnectionRow } from "@/ui/molecules/connection-row";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { FlagList } from "@/ui/molecules/flag-list";
import { PageHeader } from "@/ui/molecules/page-header";
import { SectionNav } from "@/ui/molecules/section-nav";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { SyncStatus } from "@/ui/molecules/sync-status";
import { SETTINGS_PAGE } from "@/ui/templates/settings";
import { Column, Columns, SetupCard } from "../parts";
import { CertsGroup } from "./certs-group";
import { ADD_TYPES, type AddType, ConnectionForm, GROUPS } from "./connection-form";
import { Fold } from "./fold";
import { GitlabTools } from "./gitlab-tools";
import { connectionKeys, message, useMcpServers, useProviders } from "./keys";
import { McpAddForm, McpGroup, McpMore } from "./mcp-group";
import { OutsideCard } from "./mcp-outside-group";
import { ProviderForm, ProvidersGroup } from "./providers-group";
import { Repair } from "./repair";
import { RunnersGroup, RunnersMore } from "./runners-group";

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

/** Creates a private repository on the forge. The click of the person is the write (REQ-019). */
function CreateRepo({ id }: { id: string }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [slug, setSlug] = useState("");
	const [error, setError] = useState<unknown>(null);
	return (
		<form
			className="flex items-center gap-2 py-1"
			onSubmit={(e) => {
				e.preventDefault();
				unwrap(commands.connectionsCreateRepo(id, slug.trim(), true))
					.then(() => {
						setSlug("");
						setError(null);
						return qc.invalidateQueries({ queryKey: connectionKeys.repos(id) });
					})
					.catch((err) => setError(err));
			}}
		>
			<Input
				label={t.connections.repoName}
				value={slug}
				onChange={(e) => setSlug(e.target.value)}
				className="w-64"
			/>
			<RightButton right="project.settings" type="submit" disabled={!slug.trim()}>
				<PlusIcon size={14} />
				{t.connections.repoCreate}
			</RightButton>
			{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
		</form>
	);
}

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
			<CreateRepo id={id} />
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
	const [error, setError] = useState<unknown>(null);
	const confirm = async () => {
		try {
			setError(null);
			await unwrap(commands.connectionsRemove(id));
			await qc.invalidateQueries();
		} catch (e) {
			setError(e);
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
			{error || users.error ? <ErrorNotice error={error ?? users.error} /> : null}
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
	const [error, setError] = useState<unknown>(null);
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
			setError(e);
		} finally {
			setTesting(false);
			await qc.invalidateQueries({ queryKey: connectionKeys.list });
			await qc.invalidateQueries({ queryKey: syncKeys.all });
		}
	};

	// One cause, one line: a refused token (a 401 from the sync or from the test) shows the repair
	// line with its actions, and neither the raw sync error nor the test text again.
	const refused =
		(c.kind === "github" || c.kind === "gitlab") &&
		((sync?.error != null && classify(sync.error).code === "forge_denied") ||
			(result?.kind === "failed" && result.reason.startsWith("the token was rejected")));

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
			brand={c.kind}
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
					detail={
						sync.error && !refused
							? errorMessage({ ...classify(sync.error), details: sync.error }, lang)
							: undefined
					}
				/>
			) : null}
			<GitlabTools connection={c} />
			{refused ? <Repair connection={c} /> : null}
			{result && text && !refused ? (
				<p role="status" className="flex items-center gap-2 px-3 pb-2 text-ui">
					<StatusDot
						status={result.kind === "passed" ? "success" : "danger"}
						label={t.connections.state[result.kind === "passed" ? "passed" : "failed"]}
					/>
					{text}
				</p>
			) : null}
			{error ? <ErrorNotice error={error} className="px-3 pb-2 text-ui text-danger-text" /> : null}
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
function AddForm({
	initial,
	types,
	onDone,
}: {
	initial: AddType;
	/** The types that the scope holds. */
	types: readonly AddType[];
	onDone: () => void;
}) {
	const { t } = useI18n();
	const [type, setType] = useState<AddType>(initial);
	if (type === "tracker" || type === "forge")
		return <ConnectionForm initialGroup={type} types={types} onType={setType} onDone={onDone} />;
	return (
		<div>
			<SettingsRow label={t.connections.field.type}>
				<Select
					label={t.connections.field.type}
					value={type}
					onValueChange={(v) => setType(v as AddType)}
					items={types.map((v) => ({ value: v, label: t.connections.type[v] }))}
				/>
			</SettingsRow>
			{type === "mcp" ? <McpAddForm onDone={onDone} /> : <ProviderForm onDone={onDone} />}
		</div>
	);
}

const GROUP_ICON: Record<ConnectionGroup, React.ReactNode> = {
	tracker: <InboxIcon size={14} />,
	forge: <CodeBracketIcon size={14} />,
};

const OTHER_TYPES = ADD_TYPES.filter((v) => v !== "tracker" && v !== "forge");

/**
 * One list grouped by kind, and one primary action: add a connection. A scope of Setup shows its
 * part (`spec:app-redesign#REQ-024`): the issue trackers and the code hosts under This project, the
 * AI tools, the providers, the MCP servers and the certificates under This computer.
 */
function Scoped({ scope }: { scope: "project" | "computer" }) {
	const { t } = useI18n();
	const router = useRouter();
	const ofProject = scope !== "computer";
	const ofComputer = scope !== "project";
	const types = scope === "project" ? GROUPS : OTHER_TYPES;
	const list = useQuery({
		queryKey: connectionKeys.list,
		queryFn: () => unwrap(commands.connectionsList()),
	});
	const [adding, setAdding] = useState(false);
	const [editing, setEditing] = useState(false);
	// A link from Code / Pull requests opens the form on the code host.
	const start: AddType = scope === "computer" ? "provider" : "tracker";
	const [first, setFirst] = useState<AddType>(start);
	// The form of an issue tracker or a code host is under This project: a link of before that
	// lands on This computer goes there with its question.
	const intent = (form: string, open: () => void) => () => {
		if (ofProject) return open();
		askForm(form);
		router.history.replace("/setup/project?page=connections");
	};
	useFormIntent(
		"connection",
		intent("connection", () => setAdding(true)),
	);
	useFormIntent(
		"connection:forge",
		intent("connection:forge", () => {
			setFirst("forge");
			setAdding(true);
		}),
	);
	const conns = ofProject ? list.data : [];
	const mcps = useMcpServers().data;
	const providers = useProviders().data;
	const mcpCount = ofComputer ? (mcps ?? []).filter((m) => m.enabled).length : 0;
	const providerCount = ofComputer ? (providers ?? []).length : 0;
	if (conns === undefined && !list.error)
		return scope === "computer" ? null : (
			<PageHeader icon={<LinkIcon size={16} />} title={t.tabs.settings.connections} />
		);
	const formOpen = adding || editing;
	const add = {
		label: t.connections.add,
		icon: <PlusIcon size={14} />,
		onClick: () => setAdding(true),
	};
	// The runners are not added by a person: they do not count.
	// This computer always shows its AI tools: it is never empty.
	const empty =
		scope !== "computer" && (conns ?? []).length + mcpCount + providerCount === 0 && !adding;
	// Sections that a person can see: the nav lists only these.
	const sections = [
		{
			id: "connections-runner",
			label: t.connections.group.runner,
			icon: <CpuChipIcon size={14} />,
		},
		...GROUPS.filter((g) => conns?.some((c) => c.group === g)).map((g) => ({
			id: `connections-${g}`,
			label: t.connections.group[g],
			icon: GROUP_ICON[g],
		})),
		...(providerCount > 0
			? [
					{
						id: "connections-provider",
						label: t.connections.group.provider,
						icon: <SparklesIcon size={14} />,
					},
				]
			: []),
		{ id: "connections-mcp", label: t.connections.group.mcp, icon: <PuzzlePieceIcon size={14} /> },
		{
			id: "connections-outside",
			label: t.settings.outside.title,
			icon: <ArrowsRightLeftIcon size={14} />,
		},
		{ id: "connections-certs", label: t.settings.certs.title, icon: <LockClosedIcon size={14} /> },
	];
	const addButton = empty ? undefined : (
		<Button
			variant={formOpen ? "secondary" : "primary"}
			className="min-h-control"
			disabled={adding}
			onClick={add.onClick}
		>
			{add.icon}
			{add.label}
		</Button>
	);
	return (
		<div className="flex flex-col">
			{/* This computer draws the header and the section list of its scope. */}
			{scope === "computer" ? null : (
				<>
					<PageHeader
						icon={<LinkIcon size={16} />}
						title={t.tabs.settings.connections}
						count={(conns ?? []).length + mcpCount + providerCount}
						action={addButton}
					/>
					<SectionNav label={t.ui.sections} items={sections} />
				</>
			)}
			<div className={SETTINGS_PAGE}>
				{scope === "computer" && addButton ? <div>{addButton}</div> : null}
				{list.error ? (
					<p role="alert" className="text-ui text-danger-text">
						{message(list.error)}
					</p>
				) : null}
				{empty ? (
					<div id="connections">
						<EmptyState title={t.empty.connections} action={add} />
					</div>
				) : null}
				{adding ? (
					<div className="rounded-lg border bg-surface-1 shadow-1">
						<AddForm
							initial={first}
							types={types}
							onDone={() => {
								setAdding(false);
								setFirst(start);
							}}
						/>
					</div>
				) : null}
				{GROUPS.map((g: ConnectionGroup) => {
					const rows = (conns ?? []).filter((c) => c.group === g);
					if (rows.length === 0) return null;
					return (
						<section
							key={g}
							// The anchor of the errors that a connection fixes: the first group.
							id={
								g === GROUPS.find((x) => conns?.some((c) => c.group === x))
									? "connections"
									: undefined
							}
							aria-labelledby={`connections-${g}`}
							className="flex flex-col gap-2"
						>
							<h2
								id={`connections-${g}`}
								className="flex items-center gap-2 px-1 text-12 font-medium text-n-11"
							>
								<span aria-hidden="true" className="flex">
									{GROUP_ICON[g]}
								</span>
								{format(t.count, { name: t.connections.group[g], count: rows.length })}
							</h2>
							{rows.map((c) => (
								<Row key={c.id} connection={c} formOpen={formOpen} onForm={setEditing} />
							))}
						</section>
					);
				})}
			</div>
		</div>
	);
}

/**
 * This computer: the AI tools and the model providers, then the MCP servers, the outside agents
 * and the security. One form is open at a time.
 */
function Computer() {
	const { t } = useI18n();
	const router = useRouter();
	const [editing, setEditing] = useState(false);
	// The form of an issue tracker or a code host is under This project: a link of before that
	// lands on This computer goes there with its question.
	const toProject = (form: string) => () => {
		askForm(form);
		router.history.replace("/setup/project?page=connections");
	};
	useFormIntent("connection", toProject("connection"));
	useFormIntent("connection:forge", toProject("connection:forge"));
	return (
		<>
			<Columns>
				<Column>
					<RunnersGroup />
					<ProvidersGroup formOpen={editing} onForm={setEditing} />
				</Column>
				<Column>
					<McpGroup formOpen={editing} onForm={setEditing} />
					<OutsideCard />
					<CertsGroup />
				</Column>
			</Columns>
			<div className="-mt-6 px-4 pb-10">
				<SetupCard title={t.ui.more}>
					<Fold label={t.connections.advanced}>
						<RunnersMore />
						<McpMore />
					</Fold>
				</SetupCard>
			</div>
		</>
	);
}

/** The connections of a scope of Setup (`spec:app-redesign#REQ-024`). */
export function Connections({ scope }: { scope: "project" | "computer" }) {
	return scope === "computer" ? <Computer /> : <Scoped scope={scope} />;
}
