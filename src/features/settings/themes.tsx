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
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowDownTrayIcon, PlusIcon, TrashIcon } from "@/ui/icons";
import { TILE_GRID } from "@/ui/molecules/tile";
import { Dialog } from "@/ui/organisms/dialog";
import { Fold } from "./connections/fold";
import { SetupCard, SetupRow } from "./parts";

const BUILT_IN: Theme[] = ["light", "dark", "oled", "system", "system-oled"];

/** The theme library of the machine (spec `themes`). */
function useLibrary() {
	return useQuery({ queryKey: ["themes"], queryFn: () => unwrap(commands.themeList()) });
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

/** Import with a preview, export and remove (REQ-005 to REQ-008). */
export function useThemeFiles() {
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

	return { library, importTheme, exportTheme, remove, dialog };
}

const LIGHT = ["#F3F4F7", "#FFFFFF", "#2450D8"];
const DARK = ["#0F1115", "#1A1D24", "#7E9BFF"];
/** The three bands of the sample of each built-in theme: a picture of it, the same in each theme. */
const STRIP: Record<Theme, string[]> = {
	light: LIGHT,
	dark: DARK,
	oled: ["#000000", "#111111", "#7E9BFF"],
	system: ["#F3F4F7", "#0F1115"],
	"system-oled": ["#F3F4F7", "#000000"],
};

function ThemeTile({
	label,
	colors,
	selected,
	onClick,
}: {
	label: string;
	colors: string[];
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onClick}
			className={cn(
				"flex min-h-control cursor-pointer flex-col gap-3 rounded-lg bg-surface-2 p-3 text-left font-semibold text-n-12 shadow-2",
				selected && "bg-accent-tint outline-2 outline-accent",
			)}
		>
			<span aria-hidden="true" className="flex h-14 overflow-hidden rounded-md border border-n-6">
				{colors.map((c) => (
					<span key={c} className="flex-1" style={{ background: c }} />
				))}
			</span>
			{label}
		</button>
	);
}

/** Setup / Me, Theme: one tile for each theme and one to import a theme. Export and Remove are under the files row. */
export function ThemeCard() {
	const { t } = useI18n();
	const l = t.extras.look;
	const { theme, customTheme, overridden, setPrefs } = usePrefs();
	const { library, importTheme, exportTheme, remove, dialog } = useThemeFiles();
	const custom = library.find((x) => x.id === customTheme);
	return (
		<SetupCard
			id="section-theme"
			title={t.prefs.theme}
			action={
				overridden.includes("theme") ? (
					<StatusDot status="info" label={t.projects.overridden} />
				) : null
			}
		>
			{/* biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box */}
			<div role="group" aria-label={t.prefs.theme} className={cn(TILE_GRID, "px-6 pt-2 pb-4")}>
				{BUILT_IN.map((id) => (
					<ThemeTile
						key={id}
						label={t.theme[id]}
						colors={STRIP[id]}
						selected={!custom && theme === id}
						onClick={() => setPrefs({ theme: id, customTheme: "" })}
					/>
				))}
				{library.map((x) => (
					<ThemeTile
						key={x.id}
						label={x.name}
						colors={x.base === "light" ? LIGHT : DARK}
						selected={custom?.id === x.id}
						onClick={() => setPrefs({ theme: x.base, customTheme: x.id })}
					/>
				))}
				<button
					type="button"
					onClick={() => importTheme().catch(logError)}
					className="flex min-h-control cursor-pointer flex-col gap-3 rounded-lg bg-surface-2 p-3 text-left font-semibold text-n-12 shadow-2"
				>
					<span
						aria-hidden="true"
						className="flex h-14 items-center justify-center rounded-md border border-dashed border-n-8 text-n-11"
					>
						<PlusIcon size={20} />
					</span>
					{t.personal.setup.importTheme}
				</button>
			</div>
			<Fold label={l.themeFiles}>
				<SetupRow label={l.exportTheme}>
					<Button variant="secondary" onClick={() => exportTheme().catch(logError)}>
						<ArrowDownTrayIcon size={14} />
						{l.exportTheme}
					</Button>
				</SetupRow>
				{library.map((x) => (
					<SetupRow key={x.id} label={x.name}>
						<IconButton
							label={format(l.removeTheme, { name: x.name })}
							onClick={() => remove(x).catch(logError)}
						>
							<TrashIcon size={14} />
						</IconButton>
					</SetupRow>
				))}
			</Fold>
			{dialog}
		</SetupCard>
	);
}
