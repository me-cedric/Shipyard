import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import {
	type Accent,
	commands,
	confirmDialog,
	type FocusRing,
	type Motion,
	type PanelSide,
	pickFolder,
	unwrap,
} from "@/lib/ipc";
import { logError } from "@/lib/log";
import { CODE_FONTS, formatDay, UI_FONTS, usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Segmented } from "@/ui/atoms/segmented";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SPRING, useReducedMotionPref } from "@/ui/motion";
import { Fold } from "./connections/fold";
import { TextPref } from "./me/personal";
import { ValueSelect } from "./me/value-select";
import { Column, Columns, SetupCard, SetupRow, Stepper, Toggle } from "./parts";

const SAMPLE = "2026-10-31";

/** A live sample: the ring in the chosen width, and a dot that moves unless the motion is reduced. */
export function LookPreview({ width }: { width: number }) {
	// The library reads the setting at mount: a dot that was moving must be told to stop.
	const still = useReducedMotionPref();
	return (
		<span aria-hidden="true" className="flex items-center gap-3">
			<span
				className="rounded-md border px-2 py-1 text-12"
				style={{ outline: `${width}px solid var(--accent-text)`, outlineOffset: 1 }}
			>
				Aa
			</span>
			<span className="block w-8">
				<motion.span
					className="block size-2 rounded-full bg-accent-text"
					animate={{ x: still ? 0 : 24 }}
					transition={
						still
							? { duration: 0 }
							: { ...SPRING.gentle, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }
					}
				/>
			</span>
		</span>
	);
}

const BASE_SIZE = 16;

/** The four accents of the design and the colour of the theme, as round swatches. The fifth accent is under More. */
const ACCENTS: Accent[] = ["blue", "green", "violet", "orange"];

function Colour() {
	const { t } = useI18n();
	const l = t.extras.look;
	const p = usePrefs();
	const swatch = (key: string, label: string, accent: Accent | null) => {
		const on = (p.accent ?? "theme") === key;
		return (
			<button
				key={key}
				type="button"
				aria-label={label}
				aria-pressed={on}
				title={label}
				onClick={() => p.setPrefs({ accent })}
				data-accent-swatch={accent ?? undefined}
				className={cn(
					"size-11 cursor-pointer rounded-full border border-n-7 outline-offset-3",
					accent ? "bg-accent" : "bg-n-12",
					on && "outline-3 outline-n-12",
				)}
			/>
		);
	};
	return (
		<SetupCard id="accent" title={t.personal.setup.colour}>
			{/* biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box */}
			<div role="group" aria-label={l.accent} className="flex flex-wrap gap-4 px-6 pt-2 pb-5">
				{ACCENTS.map((a) => swatch(a, l.accents[a], a))}
				{swatch("theme", l.accentTheme, null)}
			</div>
			<Fold label={t.ui.more}>
				<div className="flex gap-4 px-6 pt-2 pb-3">{swatch("rose", l.accents.rose, "rose")}</div>
			</Fold>
		</SetupCard>
	);
}

function Side({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: PanelSide;
	onChange: (v: PanelSide) => void;
}) {
	const { t } = useI18n();
	return (
		<SetupRow id={id} label={label}>
			{/* The thumb track is 52 px: the negative margin keeps the row at 60 px. */}
			<span className="-my-1 flex">
				<Segmented
					label={label}
					value={value}
					onValueChange={onChange}
					items={[
						{ value: "left", label: t.extras.look.left },
						{ value: "right", label: t.extras.look.right },
					]}
				/>
			</span>
		</SetupRow>
	);
}

function Layout() {
	const { t } = useI18n();
	const l = t.extras.look;
	const s = t.personal.setup;
	const p = usePrefs();
	return (
		<SetupCard title={s.layout}>
			<Side
				id="nav-side"
				label={s.menuPlaces}
				value={p.navSide}
				onChange={(v) => p.setPrefs({ navSide: v })}
			/>
			<Side
				id="drawer-side"
				label={s.sidePanel}
				value={p.drawerSide}
				onChange={(v) => p.setPrefs({ drawerSide: v })}
			/>
			<SetupRow id="narrow-bar" label={l.narrowBar}>
				<Toggle
					label={l.narrowBar}
					checked={p.narrowBar}
					onCheckedChange={(c) => p.setPrefs({ narrowBar: c })}
				/>
			</SetupRow>
			<SetupRow id="tray" label={s.trayIcon}>
				<Toggle label={l.tray} checked={p.tray} onCheckedChange={(c) => p.setPrefs({ tray: c })} />
			</SetupRow>
		</SetupCard>
	);
}

function MotionAndFocus() {
	const { t } = useI18n();
	const l = t.extras.look;
	const s = t.personal.setup;
	const p = usePrefs();
	return (
		<SetupCard title={s.motionFocus}>
			<SetupRow id="motion" label={l.motion}>
				<Toggle
					label={l.motion}
					checked={p.motion === "system"}
					onCheckedChange={(c) => p.setPrefs({ motion: (c ? "system" : "reduce") as Motion })}
				/>
			</SetupRow>
			<SetupRow id="focus-ring" label={s.ring}>
				<Toggle
					label={l.focusRing}
					checked={p.focusRing === "always"}
					onCheckedChange={(c) =>
						p.setPrefs({ focusRing: (c ? "always" : "keyboard") as FocusRing })
					}
				/>
			</SetupRow>
			<SetupRow id="focus-width" label={s.ringWidth}>
				<Stepper
					label={l.focusWidth}
					value={p.focusWidth}
					min={2}
					max={3}
					onValueChange={(v) => p.setPrefs({ focusWidth: v })}
				/>
			</SetupRow>
			<SetupRow id="look-preview" label={l.preview}>
				<LookPreview width={p.focusWidth} />
			</SetupRow>
		</SetupCard>
	);
}

function Text() {
	const { t, lang } = useI18n();
	const l = t.extras.look;
	const f = t.personal.prefs;
	const s = t.personal.setup;
	const p = usePrefs();
	const keys = (map: Record<string, string>) =>
		Object.keys(map).map((k) => ({ value: k, label: f.font[k as keyof typeof f.font] ?? k }));
	return (
		<SetupCard title={s.text}>
			<SetupRow id="ui-font" label={s.fontApp}>
				<ValueSelect
					label={f.uiFont}
					value={p.uiFont || "system"}
					onValueChange={(v) => p.setPrefs({ uiFont: v })}
					items={keys(UI_FONTS)}
				/>
			</SetupRow>
			<SetupRow id="code-font" label={s.fontCode}>
				<ValueSelect
					label={f.codeFont}
					value={p.codeFont || "system"}
					onValueChange={(v) => p.setPrefs({ codeFont: v })}
					items={keys(CODE_FONTS)}
				/>
			</SetupRow>
			<SetupRow label={s.fontTerminal}>
				<TextPref
					label={f.terminalFont}
					placeholder="MesloLGS NF"
					value={p.terminalFont}
					onSave={(v) => p.setPrefs({ terminalFont: v })}
				/>
			</SetupRow>
			<SetupRow label={s.terminalSize}>
				<Stepper
					label={f.terminalSize}
					value={p.terminalFontSize}
					min={8}
					max={24}
					onValueChange={(v) => p.setPrefs({ terminalFontSize: v })}
				/>
			</SetupRow>
			<SetupRow id="date-format" label={s.dates}>
				<ValueSelect
					label={l.dateFormat}
					value={p.dateFormat || "follow"}
					onValueChange={(v) => p.setPrefs({ dateFormat: v === "follow" ? "" : v })}
					items={[
						{ value: "follow", label: `${l.dateFollow} (${formatDay(SAMPLE, "", lang)})` },
						...["iso", "dmy", "mdy"].map((x) => ({ value: x, label: formatDay(SAMPLE, x, lang) })),
					]}
				/>
			</SetupRow>
		</SetupCard>
	);
}

function Computer() {
	const { t } = useI18n();
	const l = t.extras.look;
	const f = t.personal.prefs;
	const p = usePrefs();
	const qc = useQueryClient();
	const folder = useQuery({
		queryKey: ["app", "data-folder"],
		queryFn: () => unwrap(commands.appDataFolder()),
	}).data;
	const [failure, setFailure] = useState<unknown>(null);
	// Change (`spec:shell-setup-rights#REQ-008`): pick a folder, ask, then move the data and restart.
	const change = async () => {
		setFailure(null);
		try {
			const path = await pickFolder();
			if (!path) return;
			if (!(await confirmDialog(format(t.shellFn.data.confirmMove, { path })))) return;
			await unwrap(commands.appDataFolderMove(path, true));
		} catch (e) {
			logError(e);
			setFailure(e);
		}
	};
	const portable = async (on: boolean) => {
		setFailure(null);
		try {
			await unwrap(commands.appPortableSet(on, true));
		} catch (e) {
			logError(e);
			setFailure(e);
		} finally {
			await qc.invalidateQueries({ queryKey: ["app", "data-folder"] });
		}
	};
	return (
		<SetupCard title={t.personal.setup.moreComputer}>
			<SetupRow label={f.shell}>
				<TextPref
					label={f.shell}
					placeholder={f.shellHint}
					value={p.terminalShell}
					onSave={(v) => p.setPrefs({ terminalShell: v })}
				/>
			</SetupRow>
			{folder ? (
				<SetupRow id="data-folder" label={l.dataFolder}>
					<span className="max-w-80 truncate font-mono text-13 text-n-11" title={folder.path}>
						{folder.path}
					</span>
					{folder.portable ? <Badge variant="info">{l.portable}</Badge> : null}
					<Button
						className="min-h-control"
						aria-label={t.shellFn.data.changeTo}
						onClick={() => void change()}
					>
						{t.shellFn.data.change}
					</Button>
				</SetupRow>
			) : null}
			{folder ? (
				<SetupRow id="portable-mode" label={t.shellFn.data.portable}>
					<Toggle
						label={t.shellFn.data.portable}
						checked={folder.marker}
						onCheckedChange={(on) => void portable(on)}
					/>
				</SetupRow>
			) : null}
			<SetupRow id="close-push" label={t.personal.setup.closePush}>
				<Toggle
					label={l.closePush}
					checked={p.closePush}
					onCheckedChange={(c) => p.setPrefs({ closePush: c })}
				/>
			</SetupRow>
			<ErrorNotice error={failure} className="px-6" />
			<Fold label={t.ui.more}>
				<SetupRow id="all-pages" label={l.showAllPages}>
					<Toggle
						label={l.showAllPages}
						checked={p.showAllPages}
						onCheckedChange={(c) => p.setPrefs({ showAllPages: c })}
					/>
				</SetupRow>
			</Fold>
		</SetupCard>
	);
}

/** Setup / Me / Look and layout: the colour, the layout, the motion and focus, the text and what is of this computer. */
export function LookPage() {
	return (
		<Columns>
			<Column>
				<Colour />
				<Layout />
				<MotionAndFocus />
			</Column>
			<Column>
				<Text />
				<Computer />
			</Column>
		</Columns>
	);
}

/** The text size as a percent of the base size. */
export const textSizeShown = (px: number) => `${Math.round((px / BASE_SIZE) * 100)} %`;
