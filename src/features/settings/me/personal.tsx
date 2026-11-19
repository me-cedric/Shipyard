import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { usePrefs } from "@/lib/prefs";
import { BrandIcon, runnerName } from "@/ui/atoms/brand-icon";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";

const DEFAULT = "default";
const back = (v: string) => (v === DEFAULT ? "" : v);

/** A text field that saves when it loses focus. */
export function TextPref({
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
		unwrap(commands.assistantOptions()).then(setRunners).catch(logError);
	}, []);
	return runners;
}

/** The default AI tool: a pick resets the default model. */
export function DefaultAgentSelect() {
	const { t } = useI18n();
	const prefs = usePrefs();
	const runners = useRunners();
	return (
		<Select
			label={t.personal.prefs.defaultAgent}
			value={prefs.defaultAgent || DEFAULT}
			onValueChange={(v) => prefs.setPrefs({ defaultAgent: back(v), defaultModel: "" })}
			items={[
				{ value: DEFAULT, label: t.assistant.default },
				...runners.map((r) => ({
					value: r.runner,
					label: runnerName(r.runner),
					icon: <BrandIcon name={r.runner} size={14} />,
				})),
			]}
		/>
	);
}

/** The terminal apps that are installed on this machine. */
function useTerminalApps() {
	const [apps, setApps] = useState<{ id: string; label: string }[]>([]);
	useEffect(() => {
		unwrap(commands.terminalApps()).then(setApps).catch(logError);
	}, []);
	return apps;
}

/** The terminal app that opens a terminal tab outside Shipyard: the apps of this machine. */
export function TerminalAppSelect() {
	const { t } = useI18n();
	const prefs = usePrefs();
	const apps = useTerminalApps();
	return (
		<Select
			label={t.reports.terminal.app}
			value={prefs.terminalApp || DEFAULT}
			onValueChange={(v) => prefs.setPrefs({ terminalApp: back(v) })}
			items={[
				{ value: DEFAULT, label: t.reports.terminal.auto },
				...apps.map((a) => ({ value: a.id, label: a.label })),
			]}
		/>
	);
}

/** The model that the default AI tool starts with. */
export function DefaultModelSelect() {
	const { t } = useI18n();
	const prefs = usePrefs();
	const models = useRunners().find((r) => r.runner === prefs.defaultAgent)?.models ?? [];
	return (
		<Select
			label={t.personal.prefs.defaultModel}
			value={prefs.defaultModel || DEFAULT}
			onValueChange={(v) => prefs.setPrefs({ defaultModel: back(v) })}
			items={[
				{ value: DEFAULT, label: t.assistant.default },
				...models.map((m) => ({ value: m, label: m })),
			]}
		/>
	);
}
