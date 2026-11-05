import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import {
	commands,
	pickTheme,
	saveAs,
	type Theme,
	type ThemeFile,
	toFailure,
	unwrap,
} from "@/lib/ipc";
import { logError } from "@/lib/log";
import { usePrefs, useSystemDark } from "@/lib/prefs";
import { baseOf, snapshot, themeVars } from "@/lib/themes";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Select } from "@/ui/atoms/select";
import { ArrowDownTrayIcon, SwatchIcon, TrashIcon } from "@/ui/icons";
import { Dialog } from "@/ui/organisms/dialog";

const BUILT_IN: Theme[] = ["light", "dark", "oled", "system", "system-oled"];
const CUSTOM = "custom:";

/** The theme library of the machine (spec `themes`). */
function useLibrary() {
	return useQuery({ queryKey: ["themes"], queryFn: () => unwrap(commands.themeList()) });
}

/** Light, Dark, OLED, System, "System, OLED when dark", then each imported theme (REQ-002). */
export function ThemeSelect() {
	const { t } = useI18n();
	const { theme, customTheme, setPrefs } = usePrefs();
	const library = useLibrary().data ?? [];
	const value =
		customTheme && library.some((x) => x.id === customTheme) ? CUSTOM + customTheme : theme;
	return (
		<Select
			label={t.prefs.theme}
			value={value}
			onValueChange={(v) => {
				const custom = library.find((x) => CUSTOM + x.id === v);
				// An imported theme keeps its base in `theme`, so the base applies when it is removed.
				if (custom) setPrefs({ theme: custom.base, customTheme: custom.id });
				else setPrefs({ theme: v as Theme, customTheme: "" });
			}}
			items={[
				...BUILT_IN.map((v) => ({ value: v, label: t.theme[v] })),
				...library.map((x) => ({ value: CUSTOM + x.id, label: x.name })),
			]}
		/>
	);
}

/** A small sample of a theme: three surface levels, two text levels and the accent. */
function Sample({ theme }: { theme: ThemeFile }) {
	const scheme = theme.base === "light" ? "light" : "dark";
	const style = { ...themeVars(theme), colorScheme: scheme } as CSSProperties;
	return (
		<div
			aria-hidden="true"
			data-scheme={theme.base}
			style={style}
			className="flex flex-col gap-2 rounded-lg border bg-surface-0 p-3"
		>
			<div className="flex flex-col gap-2 rounded-lg border bg-surface-1 p-3">
				<div className="flex items-center gap-3 rounded-md border bg-surface-2 p-2">
					<span className="text-14 text-n-12">{theme.name}</span>
					<span className="text-12 text-n-11">Aa</span>
					<span className="ml-auto rounded-md bg-accent px-2 py-0.5 text-12 text-accent-fg">
						Aa
					</span>
				</div>
				<div className="h-6 rounded-sm bg-surface-3" />
			</div>
		</div>
	);
}

type Pending = { theme: ThemeFile } | { faults: string };

/** Settings / Me: import with a preview, export and remove (REQ-005 to REQ-008). */
export function useThemeRows() {
	const { t } = useI18n();
	const l = t.extras.look;
	const p = usePrefs();
	const systemDark = useSystemDark();
	const client = useQueryClient();
	const library = useLibrary().data ?? [];
	const [pending, setPending] = useState<Pending | null>(null);
	const set = (themes: ThemeFile[]) => client.setQueryData(["themes"], themes);

	const importTheme = async () => {
		const path = await pickTheme();
		if (!path) return;
		try {
			setPending({ theme: await unwrap(commands.themeRead(path)) });
		} catch (e) {
			setPending({ faults: toFailure(e).details });
		}
	};
	const add = async (theme: ThemeFile) => {
		set(await unwrap(commands.themeAdd(theme)));
		p.setPrefs({ theme: theme.base, customTheme: theme.id });
		setPending(null);
	};
	const exportTheme = async () => {
		const current = library.find((x) => x.id === p.customTheme);
		const theme = current ?? snapshot(baseOf(p.theme, systemDark), l.myTheme);
		const path = await saveAs(theme.id, "json");
		if (path) await unwrap(commands.themeExport(path, theme)).catch(logError);
	};
	const remove = async (theme: ThemeFile) => {
		set(await unwrap(commands.themeRemove(theme.id)));
		if (p.customTheme === theme.id) p.setPrefs({ customTheme: "" });
	};

	const dialog = (
		<Dialog
			open={pending !== null}
			onOpenChange={(open) => !open && setPending(null)}
			title={pending && "theme" in pending ? pending.theme.name : l.themeFaults}
			actions={
				pending && "theme" in pending ? (
					<Button onClick={() => add(pending.theme).catch(logError)}>{l.addTheme}</Button>
				) : null
			}
		>
			{pending && "theme" in pending ? <Sample theme={pending.theme} /> : null}
			{pending && "faults" in pending ? (
				<ul className="flex flex-col gap-1 font-mono text-12 text-danger-text">
					{pending.faults.split("\n").map((f, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: two faults can have the same text
						<li key={i}>{f}</li>
					))}
				</ul>
			) : null}
		</Dialog>
	);

	return [
		{
			id: "theme-files",
			icon: <SwatchIcon size={14} />,
			label: l.themeFiles,
			control: (
				<span className="flex items-center gap-2">
					<Button variant="ghost" onClick={() => importTheme().catch(logError)}>
						{l.importTheme}
					</Button>
					<Button variant="ghost" onClick={() => exportTheme().catch(logError)}>
						<ArrowDownTrayIcon size={14} />
						{l.exportTheme}
					</Button>
					{dialog}
				</span>
			),
		},
		...library.map((theme) => ({
			id: `theme-${theme.id}`,
			icon: <SwatchIcon size={14} />,
			label: theme.name,
			control: (
				<IconButton
					label={format(l.removeTheme, { name: theme.name })}
					onClick={() => remove(theme).catch(logError)}
				>
					<TrashIcon size={14} />
				</IconButton>
			),
		})),
	];
}
