import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PictureField } from "@/features/settings/picture-field";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ProjectCard, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { useActiveProject } from "@/lib/projects";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { ClipboardIcon, InformationCircleIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";

const EVERY = [5, 15, 30, 60, 360, 1440];

/**
 * The folder and the remote of the project, and how often the app looks at the remote. The remote
 * address never holds a user name or a password.
 */
export function ProjectDetails({ children }: { children?: ReactNode }) {
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
		<Panel id="section-details" title={d.title} icon={<InformationCircleIcon size={14} />} flush>
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
			{children}
		</Panel>
	);
}

/**
 * What the card of a project keeps behind Details (picture 060 shows the name, the chips and two
 * buttons): the folder, the code host, the branch with its counts, the last commit and the page of
 * the remote.
 */
export function CardDetails({ p, onError }: { p: ProjectCard; onError: (e: unknown) => void }) {
	const { t, lang } = useI18n();
	const w = t.workspace.page;
	return (
		<>
			<dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-14 text-n-11">
				<dt>{w.folder}</dt>
				<dd className="truncate font-mono" title={p.path}>
					{p.path}
				</dd>
				<dt>{w.codeHost}</dt>
				<dd className="truncate">{p.host ?? w.local}</dd>
				{p.branch ? (
					<>
						<dt>{w.branch}</dt>
						<dd className="flex flex-wrap items-center gap-1.5">
							<span className="font-mono">{p.branch}</span>
							{p.ahead > 0 ? (
								<Badge variant="info">{format(w.ahead, { count: p.ahead })}</Badge>
							) : null}
							{p.behind > 0 ? (
								<Badge variant="warning">{format(w.behind, { count: p.behind })}</Badge>
							) : null}
							{p.changes > 0 ? (
								<Badge variant="accent">{format(w.changes, { count: p.changes })}</Badge>
							) : null}
						</dd>
					</>
				) : null}
				<dt>{w.lastCommit}</dt>
				<dd className="truncate">
					{p.lastCommit
						? `${p.lastCommit}${
								p.lastCommitTime
									? ` · ${new Date(p.lastCommitTime * 1000).toLocaleDateString(lang, { dateStyle: "long" })}`
									: ""
							}`
						: w.noCommit}
				</dd>
			</dl>
			{p.webUrl ? (
				<Button
					className="min-h-control self-start"
					aria-label={`${w.openRemote} ${p.name}`}
					onClick={() =>
						void unwrap(commands.projectOpenRemote(p.id)).catch((e: unknown) => onError(e))
					}
				>
					{w.openRemote}
				</Button>
			) : null}
		</>
	);
}
