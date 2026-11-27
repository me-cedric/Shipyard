import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ProjectCard, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { useActiveProject } from "@/lib/projects";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { ClipboardIcon } from "@/ui/icons";
import { SetupRow } from "@/ui/molecules/setup-card";
import { PictureField } from "@/ui/organisms/picture-field";

const EVERY = [5, 15, 30, 60, 360, 1440];

/** The row of the folder of the project. */
export function ProjectFolder() {
	const { t } = useI18n();
	const active = useActiveProject().data;
	if (!active) return null;
	return (
		<SetupRow label={t.projects.details.folder}>
			<span className="rounded-md border border-n-7 bg-surface-1 px-3.5 py-2 font-mono text-ui">
				{active.path}
			</span>
		</SetupRow>
	);
}

/**
 * The logo and the remote of the project, and how often the app looks at the remote. They are rows
 * of the Project card. The remote address never holds a user name or a password.
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
		<>
			<SetupRow label={t.extras.picture.logo}>
				<PictureField which="logo" label={t.extras.picture.logo} />
			</SetupRow>
			<SetupRow label={d.remote}>
				<span className="font-mono text-ui">{remote ?? d.noRemote}</span>
				{remote ? (
					<Button variant="ghost" onClick={() => copyText(remote)}>
						<ClipboardIcon size={14} />
						{d.copy}
					</Button>
				) : null}
			</SetupRow>
			{minutes ? (
				<SetupRow label={d.watch}>
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
				</SetupRow>
			) : null}
			{children}
		</>
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
