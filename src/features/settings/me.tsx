import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, type EventSource, unwrap } from "@/lib/ipc";
import {
	type Contrast,
	type Density,
	type Overridable,
	ROLES,
	type Role,
	type Theme,
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
	ComputerDesktopIcon,
	LanguageIcon,
	SunIcon,
	SwatchIcon,
} from "@/ui/icons";
import { Settings } from "@/ui/templates/settings";

/** Where the update check reads the latest release. It saves when the field loses focus. */
function ReleaseUrl() {
	const { t } = useI18n();
	const [url, setUrl] = useState("");
	useEffect(() => {
		unwrap(commands.prefsGet())
			.then((p) => setUrl(p.releaseUrl))
			.catch((e) => console.error(e));
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
					.catch((e) => console.error(e))
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
			.catch((e) => console.error(e));
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
					.catch((e) => console.error(e));
			}}
		/>
	);
}

export function Me() {
	const { t, lang, setLang } = useI18n();
	const { theme, density, contrast, role, overridden, setPrefs } = usePrefs();
	const roles: Role[] = ["none", ...ROLES];
	// The mark: the active project sets this value, and it replaces the one below.
	const marked = (key: Overridable, control: React.ReactNode) => (
		<span className="flex items-center gap-2">
			{overridden.includes(key) ? <StatusDot status="info" label={t.projects.overridden} /> : null}
			{control}
		</span>
	);
	return (
		<div className="p-4">
			<h1 className="sr-only">{t.tabs.settings.me}</h1>
			<Settings
				sections={[
					{
						id: "me",
						title: t.tabs.settings.me,
						rows: [
							{
								id: "theme",
								icon: <SunIcon size={14} />,
								label: t.prefs.theme,
								control: marked(
									"theme",
									<Select
										label={t.prefs.theme}
										value={theme}
										onValueChange={(v) => setPrefs({ theme: v as Theme })}
										items={[
											{ value: "light", label: t.theme.light },
											{ value: "dark", label: t.theme.dark },
											{ value: "system", label: t.theme.system },
										]}
									/>,
								),
							},
							{
								id: "language",
								icon: <LanguageIcon size={14} />,
								label: t.prefs.language,
								control: (
									<Select
										label={t.prefs.language}
										value={lang}
										onValueChange={(v) => setLang(v === "fr" ? "fr" : "en")}
										items={[
											{ value: "en", label: t.lang.en },
											{ value: "fr", label: t.lang.fr },
										]}
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
						],
					},
					{
						id: "notifications",
						title: t.notifications.title,
						rows: SOURCES.map((s) => ({
							id: s,
							icon: <BellIcon size={14} />,
							label: t.notifications.source[s],
							control: <NotifySwitch source={s} />,
						})),
					},
				]}
			/>
		</div>
	);
}
