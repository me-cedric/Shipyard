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
import { Dialog } from "@/ui/organisms/dialog";
import { Fold } from "./connections/fold";
import { SetupRow } from "./parts";

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

type Scheme = "light" | "dark" | "oled";
type Band = [Scheme, string];
const strip = (s: Scheme): Band[] => [
	[s, "bg-surface-0"],
	[s, "bg-surface-1"],
	[s, "bg-accent"],
];
/** The bands of the sample of each built-in theme: each band takes the tokens of its own scheme. */
const STRIP: Record<Theme, Band[]> = {
	light: strip("light"),
	dark: strip("dark"),
	oled: strip("oled"),
	system: [
		["light", "bg-surface-0"],
		["dark", "bg-surface-0"],
	],
	"system-oled": [
		["light", "bg-surface-0"],
		["oled", "bg-surface-0"],
	],
};

function ThemeTile({
	label,
	bands,
	selected,
	onClick,
}: {
	label: string;
	bands: Band[];
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onClick}
			className={cn(
				"flex min-h-control cursor-pointer flex-col gap-3 rounded-lg border-2 border-transparent bg-surface-1 p-4 text-left font-semibold whitespace-nowrap text-n-12 shadow-1",
				selected && "border-accent bg-accent-tint",
			)}
		>
			<span aria-hidden="true" className="flex h-14 overflow-hidden rounded-md border border-n-6">
				{bands.map(([scheme, tone]) => (
					<span
						key={`${scheme}${tone}`}
						data-scheme={scheme}
						style={{ colorScheme: scheme === "light" ? "light" : "dark" }}
						className={cn("flex-1", tone)}
					/>
				))}
			</span>
			{label}
		</button>
	);
}

/** Setup / Me, Theme: one tile for each theme and one to import a theme. Export and Remove are under the files row. */
export function ThemeCard() {
	const { t } = useI18n();
	const { theme, customTheme, overridden, setPrefs } = usePrefs();
	const { library, importTheme, dialog } = useThemeFiles();
	const custom = library.find((x) => x.id === customTheme);
	return (
		<section
			id="section-theme"
			aria-labelledby="section-theme-title"
			className="min-w-0 rounded-lg bg-surface-2 py-2 shadow-2"
		>
			<h2
				id="section-theme-title"
				className="flex items-center gap-3 px-6 pt-4 text-20 font-semibold text-n-12"
			>
				{t.prefs.theme}
				{overridden.includes("theme") ? (
					<StatusDot status="info" label={t.projects.overridden} />
				) : null}
			</h2>
			{/* biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box */}
			<div
				role="group"
				aria-label={t.prefs.theme}
				className={cn(
					"grid grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))] gap-3 px-6 pt-3 pb-4",
				)}
			>
				{BUILT_IN.map((id) => (
					<ThemeTile
						key={id}
						label={t.theme[id]}
						bands={STRIP[id]}
						selected={!custom && theme === id}
						onClick={() => setPrefs({ theme: id, customTheme: "" })}
					/>
				))}
				{library.map((x) => (
					<ThemeTile
						key={x.id}
						label={x.name}
						bands={strip(x.base === "light" ? "light" : "dark")}
						selected={custom?.id === x.id}
						onClick={() => setPrefs({ theme: x.base, customTheme: x.id })}
					/>
				))}
				<button
					type="button"
					onClick={() => importTheme().catch(logError)}
					className="flex min-h-control cursor-pointer flex-col gap-3 rounded-lg border-2 border-transparent bg-surface-1 p-4 text-left font-semibold whitespace-nowrap text-n-12 shadow-1"
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
			{dialog}
		</section>
	);
}

/** Export and Remove of the themes: a row of the More card of Setup / Me. */
export function ThemeFiles() {
	const { t } = useI18n();
	const l = t.extras.look;
	const { library, exportTheme, remove } = useThemeFiles();
	return (
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
	);
}
