import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PictureField } from "@/features/settings/picture-field";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { useActiveProject } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { ClipboardIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";

const EVERY = [5, 15, 30, 60, 360, 1440];

/**
 * The folder and the remote of the project, and how often the app looks at the remote. The remote
 * address never holds a user name or a password.
 */
export function ProjectDetails() {
	const { t } = useI18n();
	const d = t.projects.details;
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const remote = useQuery({
		queryKey: ["code", "remote-url"],
		queryFn: () => unwrap(commands.codeRemoteUrl()),
	}).data;
	const minutes = useQuery({
		queryKey: ["code", "watch-interval"],
		queryFn: () => unwrap(commands.codeWatchInterval()),
	}).data;
	if (!active) return null;
	const options = [...new Set([...EVERY, ...(minutes ? [minutes] : [])])].sort((a, b) => a - b);
	return (
		<Panel title={d.title} flush>
			<SettingsRow label={t.extras.picture.logo}>
				<PictureField which="logo" label={t.extras.picture.logo} />
			</SettingsRow>
			<SettingsRow label={d.folder}>
				<span className="font-mono text-12 text-n-11">{active.path}</span>
			</SettingsRow>
			<SettingsRow label={d.remote}>
				<span className="font-mono text-12 text-n-11">{remote ?? d.noRemote}</span>
				{remote ? (
					<Button variant="ghost" onClick={() => copyText(remote)}>
						<ClipboardIcon size={14} />
						{d.copy}
					</Button>
				) : null}
			</SettingsRow>
			{minutes ? (
				<SettingsRow label={d.watch}>
					<Select
						label={d.watch}
						value={String(minutes)}
						onValueChange={async (v) => {
							await unwrap(commands.codeWatchIntervalSet(Number(v)));
							await qc.invalidateQueries({ queryKey: ["code", "watch-interval"] });
						}}
						items={options.map((m) => ({
							value: String(m),
							label: format(d.minutes, { count: m }),
						}))}
					/>
				</SettingsRow>
			) : null}
		</Panel>
	);
}
