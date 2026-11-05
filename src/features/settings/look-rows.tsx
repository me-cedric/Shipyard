import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import {
	type Accent,
	commands,
	type FocusRing,
	type Motion,
	type PanelSide,
	unwrap,
} from "@/lib/ipc";
import { formatDay, usePrefs } from "@/lib/prefs";
import { Badge } from "@/ui/atoms/badge";
import { Select } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import {
	ArrowUpTrayIcon,
	CalendarDaysIcon,
	FolderOpenIcon,
	Squares2X2Icon,
	SwatchIcon,
	UserCircleIcon,
	ViewColumnsIcon,
} from "@/ui/icons";
import { PictureField } from "./picture-field";

const ACCENTS: Accent[] = ["blue", "violet", "green", "orange", "rose"];
const SIZES = [14, 15, 16, 17, 18, 19, 20];
const SAMPLE = "2026-10-31";

/** A live sample: the ring in the chosen width, and a dot that moves unless the motion is reduced. */
function LookPreview({ width }: { width: number }) {
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
					animate={{ x: [0, 24, 0] }}
					transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY }}
				/>
			</span>
		</span>
	);
}

/** Settings / Me: the look of the app, the close choice, the picture and the data folder (W12). */
export function useLookRows() {
	const { t, lang } = useI18n();
	const l = t.extras.look;
	const p = usePrefs();
	const folder = useQuery({
		queryKey: ["app", "data-folder"],
		queryFn: () => unwrap(commands.appDataFolder()),
	}).data;
	const sides = [
		{ value: "left", label: l.left },
		{ value: "right", label: l.right },
	];
	return [
		{
			id: "avatar",
			icon: <UserCircleIcon size={14} />,
			label: t.extras.picture.avatar,
			control: <PictureField which="avatar" label={t.extras.picture.avatar} />,
		},
		{
			id: "accent",
			icon: <SwatchIcon size={14} />,
			label: l.accent,
			control: (
				<Select
					label={l.accent}
					value={p.accent ?? "theme"}
					onValueChange={(v) => p.setPrefs({ accent: v === "theme" ? null : (v as Accent) })}
					items={[
						{ value: "theme", label: l.accentTheme },
						...ACCENTS.map((a) => ({ value: a, label: l.accents[a] })),
					]}
				/>
			),
		},
		{
			id: "nav-side",
			icon: <ViewColumnsIcon size={14} />,
			label: l.navSide,
			control: (
				<Select
					label={l.navSide}
					value={p.navSide}
					onValueChange={(v) => p.setPrefs({ navSide: v as PanelSide })}
					items={sides}
				/>
			),
		},
		{
			id: "drawer-side",
			icon: <ViewColumnsIcon size={14} />,
			label: l.drawerSide,
			control: (
				<Select
					label={l.drawerSide}
					value={p.drawerSide}
					onValueChange={(v) => p.setPrefs({ drawerSide: v as PanelSide })}
					items={sides}
				/>
			),
		},
		{
			id: "text-size",
			icon: <SwatchIcon size={14} />,
			label: t.workspace.view.size,
			control: (
				<Select
					label={t.workspace.view.size}
					value={String(p.uiScale)}
					onValueChange={(v) => p.setPrefs({ uiScale: Number(v) })}
					items={SIZES.map((n) => ({ value: String(n), label: `${n} px` }))}
				/>
			),
		},
		{
			id: "narrow-bar",
			icon: <ViewColumnsIcon size={14} />,
			label: l.narrowBar,
			control: (
				<Switch
					label={l.narrowBar}
					iconOnly
					checked={p.narrowBar}
					onCheckedChange={(c) => p.setPrefs({ narrowBar: c })}
				/>
			),
		},
		{
			id: "tray",
			icon: <ViewColumnsIcon size={14} />,
			label: l.tray,
			control: (
				<Switch
					label={l.tray}
					iconOnly
					checked={p.tray}
					onCheckedChange={(c) => p.setPrefs({ tray: c })}
				/>
			),
		},
		{
			id: "motion",
			icon: <SwatchIcon size={14} />,
			label: l.motion,
			control: (
				<Select
					label={l.motion}
					value={p.motion}
					onValueChange={(v) => p.setPrefs({ motion: v as Motion })}
					items={[
						{ value: "system", label: l.motionSystem },
						{ value: "reduce", label: l.motionReduce },
					]}
				/>
			),
		},
		{
			id: "focus-ring",
			icon: <SwatchIcon size={14} />,
			label: l.focusRing,
			control: (
				<Select
					label={l.focusRing}
					value={p.focusRing}
					onValueChange={(v) => p.setPrefs({ focusRing: v as FocusRing })}
					items={[
						{ value: "keyboard", label: l.focusKeyboard },
						{ value: "always", label: l.focusAlways },
					]}
				/>
			),
		},
		{
			id: "focus-width",
			icon: <SwatchIcon size={14} />,
			label: l.focusWidth,
			control: (
				<Select
					label={l.focusWidth}
					value={String(p.focusWidth)}
					onValueChange={(v) => p.setPrefs({ focusWidth: Number(v) })}
					items={[2, 3].map((n) => ({ value: String(n), label: `${n} px` }))}
				/>
			),
		},
		{
			id: "look-preview",
			icon: <SwatchIcon size={14} />,
			label: l.preview,
			control: <LookPreview width={p.focusWidth} />,
		},
		{
			id: "all-pages",
			icon: <Squares2X2Icon size={14} />,
			label: l.showAllPages,
			control: (
				<Switch
					label={l.showAllPages}
					iconOnly
					checked={p.showAllPages}
					onCheckedChange={(c) => p.setPrefs({ showAllPages: c })}
				/>
			),
		},
		{
			id: "date-format",
			icon: <CalendarDaysIcon size={14} />,
			label: l.dateFormat,
			control: (
				<Select
					label={l.dateFormat}
					value={p.dateFormat || "follow"}
					onValueChange={(v) => p.setPrefs({ dateFormat: v === "follow" ? "" : v })}
					items={[
						{ value: "follow", label: `${l.dateFollow} (${formatDay(SAMPLE, "", lang)})` },
						...["iso", "dmy", "mdy"].map((f) => ({
							value: f,
							label: formatDay(SAMPLE, f, lang),
						})),
					]}
				/>
			),
		},
		{
			id: "close-push",
			icon: <ArrowUpTrayIcon size={14} />,
			label: l.closePush,
			control: (
				<Switch
					label={l.closePush}
					iconOnly
					checked={p.closePush}
					onCheckedChange={(c) => p.setPrefs({ closePush: c })}
				/>
			),
		},
		{
			id: "data-folder",
			icon: <FolderOpenIcon size={14} />,
			label: l.dataFolder,
			control: folder ? (
				<span className="flex items-center gap-2">
					<span className="max-w-80 truncate font-mono text-12 text-n-11" title={folder.path}>
						{folder.path}
					</span>
					{folder.portable ? <Badge variant="info">{l.portable}</Badge> : null}
				</span>
			) : null,
		},
	];
}
