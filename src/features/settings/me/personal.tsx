import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { CODE_FONTS, UI_FONTS, usePrefs } from "@/lib/prefs";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { CommandLineIcon, CpuChipIcon, DocumentTextIcon } from "@/ui/icons";
import type { SettingsSection } from "@/ui/templates/settings";

const DEFAULT = "default";
const back = (v: string) => (v === DEFAULT ? "" : v);

/** A text field that saves when it loses focus. */
function TextPref({
	label,
	value,
	placeholder,
	onSave,
	type,
}: {
	label: string;
	value: string;
	placeholder?: string;
	onSave: (v: string) => void;
	type?: "number";
}) {
	const [v, setV] = useState(value);
	useEffect(() => setV(value), [value]);
	return (
		<Input
			label={label}
			type={type}
			value={v}
			placeholder={placeholder}
			onChange={(e) => setV(e.target.value)}
			onBlur={() => v !== value && onSave(v)}
			className="w-56"
		/>
	);
}

/** The agent CLIs of this machine and the models of the chosen one (the list of the assistant composer). */
function useRunners() {
	const [runners, setRunners] = useState<{ runner: string; models: string[] }[]>([]);
	useEffect(() => {
		unwrap(commands.assistantOptions())
			.then(setRunners)
			.catch((e) => console.error(e));
	}, []);
	return runners;
}

/** The terminal apps that are installed on this machine. */
function useTerminalApps() {
	const [apps, setApps] = useState<{ id: string; label: string }[]>([]);
	useEffect(() => {
		unwrap(commands.terminalApps())
			.then(setApps)
			.catch((e) => console.error(e));
	}, []);
	return apps;
}

/** Fonts, terminal and default agent: the personal preferences (appearance, terminal, assistant tabs). */
export function usePersonalSections(): SettingsSection[] {
	const { t } = useI18n();
	const p = t.personal.prefs;
	const prefs = usePrefs();
	const runners = useRunners();
	const apps = useTerminalApps();
	const models = runners.find((r) => r.runner === prefs.defaultAgent)?.models ?? [];
	const keys = (map: Record<string, string>) =>
		Object.keys(map).map((k) => ({
			value: k,
			label: p.font[k as keyof typeof p.font] ?? k,
		}));
	return [
		{
			id: "fonts",
			title: p.fonts,
			rows: [
				{
					id: "ui-font",
					icon: <DocumentTextIcon size={14} />,
					label: p.uiFont,
					control: (
						<Select
							label={p.uiFont}
							value={prefs.uiFont || "system"}
							onValueChange={(v) => prefs.setPrefs({ uiFont: v })}
							items={keys(UI_FONTS)}
						/>
					),
				},
				{
					id: "code-font",
					icon: <DocumentTextIcon size={14} />,
					label: p.codeFont,
					control: (
						<Select
							label={p.codeFont}
							value={prefs.codeFont || "system"}
							onValueChange={(v) => prefs.setPrefs({ codeFont: v })}
							items={keys(CODE_FONTS)}
						/>
					),
				},
			],
		},
		{
			id: "terminal",
			title: p.terminal,
			rows: [
				{
					id: "shell",
					icon: <CommandLineIcon size={14} />,
					label: p.shell,
					control: (
						<TextPref
							label={p.shell}
							placeholder={p.shellHint}
							value={prefs.terminalShell}
							onSave={(v) => prefs.setPrefs({ terminalShell: v })}
						/>
					),
				},
				{
					id: "terminal-app",
					icon: <CommandLineIcon size={14} />,
					label: t.reports.terminal.app,
					control: (
						<Select
							label={t.reports.terminal.app}
							value={prefs.terminalApp || DEFAULT}
							onValueChange={(v) => prefs.setPrefs({ terminalApp: back(v) })}
							items={[
								{ value: DEFAULT, label: t.reports.terminal.auto },
								...apps.map((a) => ({ value: a.id, label: a.label })),
							]}
						/>
					),
				},
				{
					id: "terminal-font",
					icon: <CommandLineIcon size={14} />,
					label: p.terminalFont,
					control: (
						<TextPref
							label={p.terminalFont}
							placeholder="MesloLGS NF"
							value={prefs.terminalFont}
							onSave={(v) => prefs.setPrefs({ terminalFont: v })}
						/>
					),
				},
				{
					id: "terminal-size",
					icon: <CommandLineIcon size={14} />,
					label: p.terminalSize,
					control: (
						<TextPref
							label={p.terminalSize}
							type="number"
							value={String(prefs.terminalFontSize)}
							onSave={(v) => {
								const n = Number(v);
								if (Number.isFinite(n) && n > 0)
									prefs.setPrefs({ terminalFontSize: Math.round(n) });
							}}
						/>
					),
				},
			],
		},
		{
			id: "agent",
			title: p.agent,
			rows: [
				{
					id: "default-agent",
					icon: <CpuChipIcon size={14} />,
					label: p.defaultAgent,
					control: (
						<Select
							label={p.defaultAgent}
							value={prefs.defaultAgent || DEFAULT}
							onValueChange={(v) => prefs.setPrefs({ defaultAgent: back(v), defaultModel: "" })}
							items={[
								{ value: DEFAULT, label: t.assistant.default },
								...runners.map((r) => ({ value: r.runner, label: r.runner })),
							]}
						/>
					),
				},
				{
					id: "default-model",
					icon: <CpuChipIcon size={14} />,
					label: p.defaultModel,
					control: (
						<Select
							label={p.defaultModel}
							value={prefs.defaultModel || DEFAULT}
							onValueChange={(v) => prefs.setPrefs({ defaultModel: back(v) })}
							items={[
								{ value: DEFAULT, label: t.assistant.default },
								...models.map((m) => ({ value: m, label: m })),
							]}
						/>
					),
				},
			],
		},
	];
}
