import { useI18n } from "@/lib/i18n";
import { type Contrast, type Density, ROLES, type Role, type Theme, usePrefs } from "@/lib/prefs";
import { Select } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { Cog6ToothIcon, ComputerDesktopIcon, LanguageIcon, SunIcon, SwatchIcon } from "@/ui/icons";
import { Settings } from "@/ui/templates/settings";

export function Me() {
	const { t, lang, setLang } = useI18n();
	const { theme, density, contrast, role, setPrefs } = usePrefs();
	const roles: Role[] = ["none", ...ROLES];
	return (
		<div className="p-4">
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
								control: (
									<Select
										label={t.prefs.theme}
										value={theme}
										onValueChange={(v) => setPrefs({ theme: v as Theme })}
										items={[
											{ value: "light", label: t.theme.light },
											{ value: "dark", label: t.theme.dark },
											{ value: "system", label: t.theme.system },
										]}
									/>
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
								control: (
									<Switch
										label={t.prefs.compact}
										iconOnly
										checked={density === "compact"}
										onCheckedChange={(c) =>
											setPrefs({ density: (c ? "compact" : "default") satisfies Density })
										}
									/>
								),
							},
							{
								id: "contrast",
								icon: <ComputerDesktopIcon size={14} />,
								label: t.prefs.contrast,
								control: (
									<Switch
										label={t.prefs.contrast}
										iconOnly
										checked={contrast === "high"}
										onCheckedChange={(c) =>
											setPrefs({ contrast: (c ? "high" : "default") satisfies Contrast })
										}
									/>
								),
							},
						],
					},
				]}
			/>
		</div>
	);
}
