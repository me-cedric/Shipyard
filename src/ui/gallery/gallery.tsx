import { type ReactNode, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { type Theme, usePrefs } from "@/lib/prefs";
import { Avatar } from "../atoms/avatar";
import { Badge } from "../atoms/badge";
import { Button } from "../atoms/button";
import { Checkbox } from "../atoms/checkbox";
import { IconButton } from "../atoms/icon-button";
import { Input } from "../atoms/input";
import { Kbd } from "../atoms/kbd";
import { Select } from "../atoms/select";
import { Skeleton } from "../atoms/skeleton";
import { type Status, StatusDot } from "../atoms/status-dot";
import { Switch } from "../atoms/switch";
import { Textarea } from "../atoms/textarea";
import {
	ArrowPathIcon,
	Cog6ToothIcon,
	ComputerDesktopIcon,
	HomeIcon,
	InboxIcon,
	LanguageIcon,
	LinkIcon,
	MagnifyingGlassIcon,
	MoonIcon,
	SunIcon,
	XMarkIcon,
} from "../icons";
import { BacklinkList } from "../molecules/backlink-list";
import { CommitRow } from "../molecules/commit-row";
import { ConflictBlock, type ConflictChoice } from "../molecules/conflict-block";
import { ConnectionRow } from "../molecules/connection-row";
import { ContextMenu } from "../molecules/context-menu";
import { DiffView } from "../molecules/diff-view";
import { EmptyState } from "../molecules/empty-state";
import { FileRow } from "../molecules/file-row";
import { FilterBar } from "../molecules/filter-bar";
import { FindingRow } from "../molecules/finding-row";
import { FlagList } from "../molecules/flag-list";
import { NotificationRow } from "../molecules/notification-row";
import { ProjectSwitcher } from "../molecules/project-switcher";
import { RefChip } from "../molecules/ref-chip";
import { SecretInput } from "../molecules/secret-input";
import { SettingsRow } from "../molecules/settings-row";
import { SyncStatus } from "../molecules/sync-status";
import { WorkItemRow } from "../molecules/work-item-row";
import { CommandPalette } from "../organisms/command-palette";
import { CommitDialog } from "../organisms/commit-dialog";
import { Inspector } from "../organisms/inspector";
import { NotificationCentre } from "../organisms/notification-centre";
import { Toaster } from "../organisms/toaster";
import { Settings } from "../templates/settings";
import { Shell } from "../templates/shell";

const LAYERS = ["tokens", "atoms", "molecules", "organisms", "templates"] as const;
type Layer = (typeof LAYERS)[number];

const STATUSES: Status[] = ["success", "warning", "danger", "info", "active", "idle"];
const STEPS = [
	"bg-n-1",
	"bg-n-2",
	"bg-n-3",
	"bg-n-4",
	"bg-n-5",
	"bg-n-6",
	"bg-n-7",
	"bg-n-8",
	"bg-n-9",
	"bg-n-10",
	"bg-n-11",
	"bg-n-12",
];
const COLOURS = [
	"bg-accent",
	"bg-success",
	"bg-warning",
	"bg-danger",
	"bg-info",
	"bg-accent-subtle",
	"bg-success-subtle",
	"bg-warning-subtle",
	"bg-danger-subtle",
	"bg-info-subtle",
];
const SIZES = ["text-11", "text-12", "text-13", "text-14", "text-16", "text-20"];

function Row({ name, children }: { name: string; children: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center gap-3 border-b py-3">
			<span className="w-32 font-mono text-11 text-n-10">{name}</span>
			{children}
		</div>
	);
}

function Tokens() {
	return (
		<div>
			<Row name="neutral">
				{STEPS.map((c) => (
					<div key={c} className={`${c} size-8 rounded-sm border`} />
				))}
			</Row>
			<Row name="accent, status">
				{COLOURS.map((c) => (
					<div key={c} className={`${c} size-8 rounded-sm border`} />
				))}
			</Row>
			<Row name="type">
				{SIZES.map((s) => (
					<span key={s} className={s}>
						{s.slice(5)}
					</span>
				))}
				<span className="font-mono text-13">wi:KEY-1 0123</span>
			</Row>
			<Row name="radius">
				<div className="size-8 rounded-sm border" />
				<div className="size-8 rounded-md border" />
			</Row>
		</div>
	);
}

function Atoms() {
	const { t } = useI18n();
	const [lang, setLang] = useState("a");
	return (
		<div>
			<Row name="Button">
				<Button variant="primary">Button</Button>
				<Button>Button</Button>
				<Button variant="ghost">Button</Button>
				<Button variant="danger">Button</Button>
				<Button disabled>Button</Button>
			</Row>
			<Row name="IconButton">
				<IconButton label={t.common.search} shortcut="⌘K">
					<MagnifyingGlassIcon size={16} />
				</IconButton>
				<IconButton label={t.common.open}>
					<ArrowPathIcon size={16} />
				</IconButton>
			</Row>
			<Row name="Input">
				<Input label={t.common.search} className="w-48" />
			</Row>
			<Row name="Textarea">
				<Textarea label={t.code.description} className="w-64" />
			</Row>
			<Row name="Select">
				<Select
					label={t.prefs.language}
					value={lang}
					onValueChange={setLang}
					items={[
						{ value: "a", label: "A" },
						{ value: "b", label: "B" },
					]}
				/>
			</Row>
			<Row name="Checkbox, Switch">
				<Checkbox label={t.common.open} defaultChecked />
				<Switch label={t.common.search} defaultChecked />
			</Row>
			<Row name="Badge">
				<Badge>Badge</Badge>
				<Badge variant="accent">Badge</Badge>
				<Badge variant="success">Badge</Badge>
				<Badge variant="warning">Badge</Badge>
				<Badge variant="danger">Badge</Badge>
				<Badge variant="info">Badge</Badge>
			</Row>
			<Row name="StatusDot">
				{STATUSES.map((s) => (
					<StatusDot key={s} status={s} />
				))}
			</Row>
			<Row name="Avatar, Kbd">
				<Avatar name="Cédric Meyer" />
				<Kbd>⌘K</Kbd>
			</Row>
			<Row name="Skeleton">
				<Skeleton className="h-row w-48" />
			</Row>
		</div>
	);
}

function Molecules() {
	const { t } = useI18n();
	const [query, setQuery] = useState("");
	const [active, setActive] = useState<string[]>([]);
	const [project, setProject] = useState("alpha");
	const [secret, setSecret] = useState("");
	const [choice, setChoice] = useState<ConflictChoice | null>(null);
	const noop = () => {};
	return (
		<div>
			<Row name="RefChip">
				<RefChip refId="wi:KEY-1" state="resolved" title="KEY-1" />
				<RefChip refId="spec:auth" state="unresolved" />
				<RefChip refId="adr:0009" state="broken" />
			</Row>
			<Row name="BacklinkList">
				<div className="w-72">
					<BacklinkList
						groups={[
							{
								kind: "spec",
								items: [{ ref: "spec:auth", title: "Spec: auth" }, { ref: "spec:billing" }],
							},
							{ kind: "change", items: [{ ref: "change:add-auth" }] },
						]}
						onOpen={noop}
					/>
				</div>
				<div className="w-72">
					<BacklinkList groups={[]} onOpen={noop} />
				</div>
			</Row>
			<Row name="ProjectSwitcher">
				<ProjectSwitcher
					value={project}
					onChange={setProject}
					projects={[
						{ id: "alpha", name: "Alpha", state: "clean" },
						{ id: "beta", name: "Beta", state: "changed" },
						{ id: "gamma", name: "Gamma", state: "behind" },
						{ id: "delta", name: "Delta", state: "ahead" },
						{ id: "eps", name: "Epsilon", state: "missing" },
					]}
				/>
			</Row>
			<Row name="FindingRow">
				<div className="w-full max-w-xl">
					<FindingRow
						status="warning"
						title="Broken ref adr:0009"
						source={<RefChip refId="spec:auth" state="resolved" />}
						action={{ label: t.common.open, onClick: noop }}
					/>
				</div>
			</Row>
			<Row name="SettingsRow">
				<div className="w-96">
					<SettingsRow icon={<SunIcon size={14} />} label={t.prefs.theme}>
						<Switch label={t.prefs.theme} iconOnly />
					</SettingsRow>
				</div>
			</Row>
			<Row name="FlagList">
				<FlagList
					label={t.connections.flags}
					onLabel={t.connections.on}
					offLabel={t.connections.off}
					flags={[
						{ id: "hierarchy", label: t.connections.flag.hierarchy, on: true },
						{ id: "labels", label: t.connections.flag.labels, on: true },
						{ id: "timeTracking", label: t.connections.flag.timeTracking, on: false },
					]}
				/>
			</Row>
			<Row name="SecretInput">
				<SecretInput
					label={t.connections.field.secret}
					saved={false}
					value={secret}
					onChange={setSecret}
					className="w-48"
				/>
				<SecretInput
					label={t.connections.field.secret}
					saved
					value=""
					onChange={noop}
					className="w-48"
				/>
			</Row>
			<Row name="ConnectionRow">
				<div className="w-full max-w-xl">
					<ConnectionRow
						status="success"
						statusLabel={t.connections.state.passed}
						name="Acme"
						product={t.connections.kind.tracker.linear}
						flags={
							<FlagList
								label={t.connections.flags}
								onLabel={t.connections.on}
								offLabel={t.connections.off}
								flags={[
									{ id: "labels", label: t.connections.flag.labels, on: true },
									{ id: "timeTracking", label: t.connections.flag.timeTracking, on: false },
								]}
							/>
						}
						actions={
							<IconButton label={t.connections.remove}>
								<XMarkIcon size={14} />
							</IconButton>
						}
					/>
				</div>
			</Row>
			<Row name="SyncStatus">
				<div className="w-full max-w-xl">
					{(
						[
							["success", "idle", "10:42"],
							["active", "running", undefined],
							["danger", "failed", "10:30"],
						] as const
					).map(([status, state, time]) => (
						<SyncStatus
							key={state}
							status={status}
							label={t.sync.state[state]}
							time={time}
							detail={state === "failed" ? "offline" : undefined}
						/>
					))}
				</div>
			</Row>
			<Row name="WorkItemRow">
				<div className="w-full max-w-xl">
					<WorkItemRow
						itemKey="ACME-1"
						title="Fix login redirect"
						status="To Do"
						category="todo"
						assignee="Ada"
						claimed={t.sync.backlog.claimed}
						actions={
							<IconButton label={t.sync.backlog.link}>
								<LinkIcon size={14} />
							</IconButton>
						}
					/>
					<WorkItemRow itemKey="ACME-2" title="Bump deps" status="Done" category="done" />
				</div>
			</Row>
			<Row name="ContextMenu">
				<ContextMenu
					items={[
						{ id: "open", label: t.context.open, onSelect: noop },
						{ id: "copy", label: t.context.copyRef, shortcut: "C", onSelect: noop },
					]}
				>
					<button type="button" className="rounded-md border px-3 py-1 text-ui">
						wi:KEY-1
					</button>
				</ContextMenu>
			</Row>
			<Row name="NotificationRow">
				<div className="w-full max-w-xl">
					{(["info", "error", "needs-you"] as const).map((kind) => (
						<NotificationRow
							key={kind}
							kind={kind}
							kindLabel={t.notifications.kind[kind]}
							title={format(t.notifications.update, { version: "0.2.0" })}
							body="https://example.com/releases/latest"
							time="10:42"
							unread={kind !== "info"}
						/>
					))}
				</div>
			</Row>
			<Row name="FileRow">
				<div className="w-72">
					<FileRow name="src" depth={0} check={{ checked: false, label: "src", onChange: noop }} />
					<FileRow
						name="app.ts"
						depth={1}
						state="modified"
						stateLabel={t.code.state.modified}
						selected
						check={{ checked: true, label: "app.ts", onChange: noop }}
					/>
					<FileRow
						name="new.ts"
						depth={1}
						state="untracked"
						stateLabel={t.code.state.untracked}
						check={{ checked: false, label: "new.ts", onChange: noop }}
					/>
					<FileRow
						name="old.ts"
						depth={1}
						state="conflicted"
						stateLabel={t.code.state.conflicted}
					/>
				</div>
			</Row>
			<Row name="DiffView">
				<div className="w-full max-w-xl">
					<DiffView
						text={"diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"}
						label="a"
						binaryLabel={t.code.binary}
						truncatedLabel={t.code.truncated}
					/>
				</div>
			</Row>
			<Row name="CommitRow">
				<div className="w-full max-w-xl">
					<CommitRow
						short="1a2b3c4"
						summary="fix(auth): refuse an empty token"
						author="Ada Lovelace"
						date="29 Oct 2026"
						labels={[
							{ name: "main", kind: "branch" },
							{ name: "origin/main", kind: "remote" },
							{ name: "v0.1.0", kind: "tag" },
						]}
						onSelect={noop}
					/>
				</div>
			</Row>
			<Row name="ConflictBlock">
				<div className="w-full max-w-xl">
					<ConflictBlock
						title={format(t.code.block, { n: 1 })}
						ours={"const a = 1;\n"}
						theirs={"const a = 2;\n"}
						choice={choice}
						onChoose={setChoice}
						labels={{
							ours: t.code.ours,
							theirs: t.code.theirs,
							both: t.code.both,
							neither: t.code.neither,
						}}
					/>
				</div>
			</Row>
			<Row name="FilterBar">
				<FilterBar
					query={query}
					onQueryChange={setQuery}
					filters={[
						{ id: "inbox", label: t.common.open, icon: <InboxIcon size={14} /> },
						{ id: "home", label: t.common.search, icon: <HomeIcon size={14} /> },
					]}
					active={active}
					onToggle={(id) =>
						setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
					}
				/>
			</Row>
			<Row name="EmptyState">
				<EmptyState action={{ label: t.empty.create, onClick: () => {} }} />
			</Row>
		</div>
	);
}

function Organisms() {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const [panel, setPanel] = useState(true);
	const [commit, setCommit] = useState(false);
	const noop = () => {};
	return (
		<div>
			<Row name="CommandPalette">
				<Button onClick={() => setOpen(true)}>
					<MagnifyingGlassIcon size={14} />
					{t.palette.title}
				</Button>
				<CommandPalette
					open={open}
					onOpenChange={setOpen}
					groups={[
						{
							id: "go",
							heading: "Go",
							items: [
								{
									id: "home",
									label: "Home",
									icon: <HomeIcon size={14} />,
									shortcut: "G H",
									onSelect: noop,
								},
								{
									id: "settings",
									label: t.gallery.settings,
									icon: <Cog6ToothIcon size={14} />,
									onSelect: noop,
								},
							],
						},
					]}
				/>
			</Row>
			<Row name="CommitDialog">
				<Button onClick={() => setCommit(true)}>{t.shell.commit}</Button>
				<CommitDialog open={commit} onOpenChange={setCommit} onSubmit={async () => {}} />
			</Row>
			<Row name="NotificationCentre">
				<NotificationCentre
					items={[
						{
							id: "a",
							kind: "needs-you",
							title: format(t.notifications.update, { version: "0.2.0" }),
							time: Date.now(),
							read: false,
						},
					]}
					unread={1}
					onOpen={noop}
					onClear={noop}
				/>
			</Row>
			<Row name="Toaster">
				<div className="relative h-24 w-[28rem]">
					<Toaster
						toasts={[
							{
								id: "t",
								kind: "info",
								title: format(t.notifications.update, { version: "0.2.0" }),
								time: Date.now(),
								read: false,
							},
						]}
						onDismiss={noop}
					/>
				</div>
			</Row>
			<Row name="Inspector">
				<Button onClick={() => setPanel((p) => !p)}>{t.inspector.title}</Button>
				<div className="flex h-48 w-[28rem] border">
					<div className="flex-1" />
					<Inspector open={panel} onClose={() => setPanel(false)} title={t.inspector.title}>
						<Skeleton className="h-row" />
					</Inspector>
				</div>
			</Row>
		</div>
	);
}

function Templates() {
	const { t } = useI18n();
	const [open, setOpen] = useState(true);
	const prefs = usePrefs();
	return (
		<div>
			<Row name="Shell">
				<div className="h-64 w-full border">
					<Shell
						sidebarOpen={open}
						sidebar={
							<div className="p-1">
								<IconButton
									label={open ? t.nav.collapse : t.nav.expand}
									onClick={() => setOpen((o) => !o)}
								>
									<HomeIcon size={16} />
								</IconButton>
							</div>
						}
						main={<div className="p-3" />}
						statusbar={<StatusDot status="success" />}
					/>
				</div>
			</Row>
			<Row name="Settings">
				<Settings
					sections={[
						{
							id: "prefs",
							title: t.gallery.settings,
							rows: [
								{
									id: "contrast",
									icon: <SunIcon size={14} />,
									label: t.prefs.contrast,
									control: (
										<Switch
											label={t.prefs.contrast}
											iconOnly
											checked={prefs.contrast === "high"}
											onCheckedChange={(c) => prefs.setPrefs({ contrast: c ? "high" : "default" })}
										/>
									),
								},
								{
									id: "density",
									icon: <Cog6ToothIcon size={14} />,
									label: t.prefs.compact,
									control: (
										<Switch
											label={t.prefs.compact}
											iconOnly
											checked={prefs.density === "compact"}
											onCheckedChange={(c) =>
												prefs.setPrefs({ density: c ? "compact" : "default" })
											}
										/>
									),
								},
							],
						},
					]}
				/>
			</Row>
		</div>
	);
}

const PAGES: Record<Layer, () => ReactNode> = {
	tokens: Tokens,
	atoms: Atoms,
	molecules: Molecules,
	organisms: Organisms,
	templates: Templates,
};

const THEME_ICON: Record<Theme, ReactNode> = {
	light: <SunIcon size={16} />,
	dark: <MoonIcon size={16} />,
	system: <ComputerDesktopIcon size={16} />,
};

export function Gallery() {
	const { t, lang, setLang } = useI18n();
	const { theme, setPrefs } = usePrefs();
	const [layer, setLayer] = useState<Layer>("tokens");
	const Page = PAGES[layer];
	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
			<header className="flex items-center gap-2">
				<nav aria-label={t.nav.sidebar} className="flex flex-1 gap-1">
					{LAYERS.map((l) => (
						<Button
							key={l}
							variant="ghost"
							aria-current={l === layer ? "page" : undefined}
							className={l === layer ? "bg-n-4" : undefined}
							onClick={() => setLayer(l)}
						>
							{t.gallery[l]}
						</Button>
					))}
				</nav>
				{(Object.keys(THEME_ICON) as Theme[]).map((th) => (
					<IconButton
						key={th}
						label={t.theme[th]}
						aria-pressed={theme === th}
						className={theme === th ? "bg-n-4 text-n-12" : undefined}
						onClick={() => setPrefs({ theme: th })}
					>
						{THEME_ICON[th]}
					</IconButton>
				))}
				<IconButton label={t.prefs.language} onClick={() => setLang(lang === "en" ? "fr" : "en")}>
					<LanguageIcon size={16} />
				</IconButton>
			</header>
			<Page />
		</div>
	);
}
