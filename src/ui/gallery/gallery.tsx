import { type ReactNode, useState } from "react";
import { useI18n } from "@/lib/i18n";
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
import {
	ArrowPathIcon,
	Cog6ToothIcon,
	ComputerDesktopIcon,
	HomeIcon,
	InboxIcon,
	LanguageIcon,
	MagnifyingGlassIcon,
	MoonIcon,
	SunIcon,
} from "../icons";
import { EmptyState } from "../molecules/empty-state";
import { FilterBar } from "../molecules/filter-bar";
import { RefChip } from "../molecules/ref-chip";
import { SettingsRow } from "../molecules/settings-row";
import { CommandPalette } from "../organisms/command-palette";
import { Inspector } from "../organisms/inspector";
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
	return (
		<div>
			<Row name="RefChip">
				<RefChip refId="wi:KEY-1" state="resolved" title="KEY-1" />
				<RefChip refId="spec:auth" state="unresolved" />
				<RefChip refId="adr:0009" state="broken" />
			</Row>
			<Row name="SettingsRow">
				<div className="w-96">
					<SettingsRow icon={<SunIcon size={14} />} label={t.prefs.theme}>
						<Switch label={t.prefs.theme} iconOnly />
					</SettingsRow>
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
