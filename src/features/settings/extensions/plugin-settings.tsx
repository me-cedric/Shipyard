import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands, type PluginSetting_Serialize as Setting, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SettingsRow } from "@/ui/molecules/settings-row";

/** The control of one setting, from the type that the manifest gives. */
function Field({
	setting: s,
	value,
	onChange,
}: {
	setting: Setting;
	value: string;
	onChange: (v: string) => void;
}) {
	if (s.field.type === "boolean")
		return (
			<Switch
				label={s.key}
				iconOnly
				checked={value === "true"}
				onCheckedChange={(on) => onChange(on ? "true" : "false")}
			/>
		);
	if (s.field.type === "choice")
		return (
			<Select
				label={s.key}
				value={value}
				onValueChange={onChange}
				items={[
					...(s.field.required ? [] : [{ value: "", label: "—" }]),
					...s.field.choices.map((c) => ({ value: c, label: c })),
				]}
			/>
		);
	return (
		<Input
			label={s.key}
			type={s.field.type === "number" ? "number" : "text"}
			inputMode={s.field.type === "number" ? "decimal" : undefined}
			required={s.field.required}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className="w-64"
		/>
	);
}

/** The typed settings form of an applied plugin. The save checks every value or writes none. */
export function PluginSettings({ name }: { name: string }) {
	const { t } = useI18n();
	const x = t.extensions.plugin;
	const qc = useQueryClient();
	const { failure, run } = useGuard();
	const heading = useId();
	const key = ["plugin-settings", name];
	const rows = useQuery({ queryKey: key, queryFn: () => unwrap(commands.pluginSettingsGet(name)) });
	const [values, setValues] = useState<Record<string, string>>({});
	const [saved, setSaved] = useState(false);
	const shownValue = (s: Setting) => values[s.key] ?? s.value;
	return (
		<form
			aria-labelledby={heading}
			className="flex flex-col border-t bg-surface-1"
			onSubmit={(e) => {
				e.preventDefault();
				void run(async () => {
					setSaved(false);
					qc.setQueryData(key, await unwrap(commands.pluginSettingsSave(name, values, true)));
					setValues({});
					setSaved(true);
				});
			}}
		>
			<h3 id={heading} className="px-3 pt-2 text-12 font-medium text-n-11">
				{format(x.settingsName, { name })}
			</h3>
			{(rows.data ?? []).map((s) => (
				<SettingsRow key={s.key} label={s.key}>
					<Field
						setting={s}
						value={shownValue(s)}
						onChange={(v) => {
							setSaved(false);
							setValues({ ...values, [s.key]: v });
						}}
					/>
				</SettingsRow>
			))}
			<div className="flex items-center gap-2 px-3 py-2">
				<Button type="submit" variant="primary" disabled={Object.keys(values).length === 0}>
					{x.save}
				</Button>
				{saved ? (
					<span role="status" className="text-12 text-success-text">
						{x.saved}
					</span>
				) : null}
			</div>
			<ErrorNotice error={failure} className="px-3 pb-2" />
		</form>
	);
}
