import { useEffect, useState } from "react";
import { usePermissionSection, useSetupSection } from "@/features/onboarding";
import { LANGS, useI18n } from "@/lib/i18n";
import { commands, type EventSource, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import {
	type Contrast,
	type Density,
	type Overridable,
	ROLES,
	type Role,
	usePrefs,
} from "@/lib/prefs";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { Switch } from "@/ui/atoms/switch";
import {
	ArrowDownTrayIcon,
	BellIcon,
	Cog6ToothIcon,
	CommandLineIcon,
	ComputerDesktopIcon,
	CpuChipIcon,
	DocumentTextIcon,
	LanguageIcon,
	ShieldCheckIcon,
	SparklesIcon,
	SunIcon,
	SwatchIcon,
	UserCircleIcon,
} from "@/ui/icons";
import { PageHeader } from "@/ui/molecules/page-header";
import { SectionNav } from "@/ui/molecules/section-nav";
import { SETTINGS_PAGE, Settings } from "@/ui/templates/settings";
import { LanguageSelect, useLanguageRows } from "./languages";
import { useLookRows } from "./look-rows";
import { usePersonalSections } from "./me/personal";
import { ThemeSelect, useThemeRows } from "./themes";

/** The icon of each section heading, by section id. */
const SECTION_ICON: Record<string, React.ReactNode> = {
	me: <UserCircleIcon size={14} />,
	fonts: <DocumentTextIcon size={14} />,
	terminal: <CommandLineIcon size={14} />,
	agent: <CpuChipIcon size={14} />,
	notifications: <BellIcon size={14} />,
	permissions: <ShieldCheckIcon size={14} />,
	setup: <SparklesIcon size={14} />,
};

/** Where the update check reads the latest release. It saves when the field loses focus. */
function ReleaseUrl() {
	const { t } = useI18n();
	const [url, setUrl] = useState("");
	useEffect(() => {
		unwrap(commands.prefsGet())
			.then((p) => setUrl(p.releaseUrl))
			.catch(logError);
	}, []);
	return (
		<Input
			label={t.prefs.releaseUrl}
			value={url}
			onChange={(e) => setUrl(e.target.value)}
			// An empty value restores the default address, and the field shows it.
			onBlur={() =>
				unwrap(commands.prefsSet({ releaseUrl: url }))
					.then((p) => setUrl(p.releaseUrl))
					.catch(logError)
			}
			className="w-80"
		/>
	);
}

const SOURCES: EventSource[] = [
	"question",
	"approval",
	"run",
	"sync-failure",
	"update",
	"remote-head",
	"run-ended",
	"pr-checks",
	"scan-failed",
	"review-draft",
];

const DIAGRAM_FORMATS = [
	{ value: "excalidraw", label: "Excalidraw" },
	{ value: "mermaid", label: "Mermaid" },
	{ value: "drawio", label: "draw.io" },
	{ value: "bpmn", label: "BPMN" },
];

// One queue for all switches: each write reads the stored list after the write before it is done.
let writes: Promise<unknown> = Promise.resolve();

/** One switch for a source of notifications. Off adds the source to `Prefs.notifyOff` (REQ-008). */
function NotifySwitch({ source }: { source: EventSource }) {
	const { t } = useI18n();
	const [off, setOff] = useState<EventSource[]>([]);
	useEffect(() => {
		unwrap(commands.prefsGet())
			.then((p) => setOff(p.notifyOff))
			.catch(logError);
	}, []);
	return (
		<Switch
			label={t.notifications.source[source]}
			iconOnly
			checked={!off.includes(source)}
			onCheckedChange={(on) => {
				writes = writes
					.then(() => unwrap(commands.prefsGet()))
					.then((p) =>
						unwrap(
							commands.prefsSet({
								notifyOff: on
									? p.notifyOff.filter((s) => s !== source)
									: [...p.notifyOff.filter((s) => s !== source), source],
							}),
						),
					)
					.then((p) => setOff(p.notifyOff))
					.catch(logError);
			}}
		/>
	);
}

export function Me() {
	const { t } = useI18n();
	const {
		density,
		contrast,
		role,
		overridden,
		setPrefs,
		promptLang,
		diagramFormat,
		autoUpdateCheck,
	} = usePrefs();
	const roles: Role[] = ["none", ...ROLES];
	const personal = usePersonalSections();
	const look = useLookRows();
	const permissions = usePermissionSection();
	const setup = useSetupSection();
	const withIcon = personal.map((s) => ({ ...s, icon: SECTION_ICON[s.id] }));
	const nav = [
		{ id: "me", title: t.tabs.settings.me },
		...personal,
		{ id: "notifications", title: t.notifications.title },
		{ id: setup.id, title: setup.title },
		{ id: permissions.id, title: permissions.title },
	].map((s) => ({ id: `section-${s.id}`, label: s.title, icon: SECTION_ICON[s.id] }));
	const themeRows = useThemeRows();
	const languageRows = useLanguageRows();
	// The mark: the active project sets this value, and it replaces the one below.
	const marked = (key: Overridable, control: React.ReactNode) => (
		<span className="flex items-center gap-2">
			{overridden.includes(key) ? <StatusDot status="info" label={t.projects.overridden} /> : null}
			{control}
		</span>
	);
	return (
		<div className="flex flex-col">
			<PageHeader icon={<UserCircleIcon size={16} />} title={t.tabs.settings.me} />
			<SectionNav label={t.ui.sections} items={nav} />
			<div className={SETTINGS_PAGE}>
				<Settings
					sections={[
						{
							id: "me",
							title: t.tabs.settings.me,
							icon: SECTION_ICON.me,
							rows: [
								{
									id: "theme",
									icon: <SunIcon size={14} />,
									label: t.prefs.theme,
									control: marked("theme", <ThemeSelect />),
								},
								...themeRows,
								{
									id: "language",
									icon: <LanguageIcon size={14} />,
									label: t.prefs.language,
									control: <LanguageSelect />,
								},
								...languageRows,
								{
									id: "prompt-lang",
									icon: <LanguageIcon size={14} />,
									label: t.prefs.promptLang,
									control: (
										<Select
											label={t.prefs.promptLang}
											value={promptLang || "follow"}
											onValueChange={(v) => setPrefs({ promptLang: v === "follow" ? "" : v })}
											items={[
												{ value: "follow", label: t.prefs.promptFollow },
												...LANGS.map((l) => ({ value: l, label: t.lang[l] })),
											]}
										/>
									),
								},
								{
									id: "diagram-format",
									icon: <SwatchIcon size={14} />,
									label: t.prefs.diagramFormat,
									control: (
										<Select
											label={t.prefs.diagramFormat}
											value={diagramFormat || "excalidraw"}
											onValueChange={(v) => setPrefs({ diagramFormat: v })}
											items={DIAGRAM_FORMATS}
										/>
									),
								},
								{
									id: "auto-update",
									icon: <ArrowDownTrayIcon size={14} />,
									label: t.prefs.autoUpdate,
									control: (
										<Switch
											label={t.prefs.autoUpdate}
											iconOnly
											checked={autoUpdateCheck}
											onCheckedChange={(c) => setPrefs({ autoUpdateCheck: c })}
										/>
									),
								},
								{
									id: "release",
									icon: <ArrowDownTrayIcon size={14} />,
									label: t.prefs.releaseUrl,
									control: <ReleaseUrl />,
								},
								{
									id: "role",
									icon: <SwatchIcon size={14} />,
									label: t.prefs.role,
									control: (
										<Select
											label={t.prefs.role}
											value={role}
											onValueChange={(v) => setPrefs({ role: v as Role })}
											items={roles.map((r) => ({ value: r, label: t.role[r] }))}
										/>
									),
								},
								{
									id: "density",
									icon: <Cog6ToothIcon size={14} />,
									label: t.prefs.compact,
									control: marked(
										"density",
										<Switch
											label={t.prefs.compact}
											iconOnly
											checked={density === "compact"}
											onCheckedChange={(c) =>
												setPrefs({ density: (c ? "compact" : "default") satisfies Density })
											}
										/>,
									),
								},
								{
									id: "contrast",
									icon: <ComputerDesktopIcon size={14} />,
									label: t.prefs.contrast,
									control: marked(
										"contrast",
										<Switch
											label={t.prefs.contrast}
											iconOnly
											checked={contrast === "high"}
											onCheckedChange={(c) =>
												setPrefs({ contrast: (c ? "high" : "default") satisfies Contrast })
											}
										/>,
									),
								},
								...look,
							],
						},
						...withIcon,
						{
							id: "notifications",
							title: t.notifications.title,
							icon: SECTION_ICON.notifications,
							rows: SOURCES.map((s) => ({
								id: s,
								icon: <BellIcon size={14} />,
								label: t.notifications.source[s],
								control: <NotifySwitch source={s} />,
							})),
						},
						{ ...setup, icon: SECTION_ICON.setup },
						{ ...permissions, icon: SECTION_ICON.permissions },
					]}
				/>
			</div>
		</div>
	);
}
