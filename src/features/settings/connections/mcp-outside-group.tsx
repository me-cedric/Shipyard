import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type McpGates_Serialize as Gates, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { StatusDot } from "@/ui/atoms/status-dot";
import { Switch } from "@/ui/atoms/switch";
import { ArrowDownTrayIcon, ClipboardIcon } from "@/ui/icons";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { message } from "./keys";

const GROUPS = ["reads", "writes", "git", "forge", "exec", "delivery"] as const;
const outsideKey = ["mcp", "outside"] as const;
const elsewhereKey = ["mcp", "elsewhere"] as const;

/** The Shipyard MCP server for agents that Shipyard did not start: its switches, its address, its wiring. */
export function McpOutsideGroup() {
	const { t } = useI18n();
	const o = t.settings.outside;
	const qc = useQueryClient();
	const status = useQuery({
		queryKey: outsideKey,
		queryFn: () => unwrap(commands.mcpOutsideGet()),
	});
	const elsewhere = useQuery({
		queryKey: elsewhereKey,
		queryFn: () => unwrap(commands.mcpElsewhereList()),
	});
	const [draft, setDraft] = useState<Gates | null>(null);
	const [port, setPort] = useState<string | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const s = status.data;
	if (!s) return null;
	const g = draft ?? s.gates;
	const attempt = async (job: () => Promise<string | null>) => {
		setError(null);
		setNote(null);
		try {
			setNote(await job());
		} catch (e) {
			setError(message(e));
		}
	};
	const toggleTool = (tool: string, on: boolean) =>
		setDraft({
			...g,
			allowedTools: on ? [...g.allowedTools, tool] : g.allowedTools.filter((x) => x !== tool),
		});
	const save = () =>
		attempt(async () => {
			await unwrap(commands.mcpOutsideSet({ ...g, port: Number(port ?? g.port) }));
			setDraft(null);
			setPort(null);
			await qc.invalidateQueries({ queryKey: outsideKey });
			return null;
		});
	const label = (name: (typeof GROUPS)[number]) => o[name];
	return (
		<section aria-labelledby="connections-outside" className="flex flex-col gap-2">
			<h2 id="connections-outside" className="px-1 py-1 text-12 font-medium text-n-11">
				{o.title}
			</h2>
			<div className="flex flex-col rounded-lg border bg-surface-1 shadow-1">
				<SettingsRow label={o.enabled}>
					<StatusDot
						status={s.running ? "success" : "idle"}
						label={s.running ? o.running : o.stopped}
					/>
					<span className="font-mono text-12 text-n-11">{s.url}</span>
					<Switch
						label={o.enabled}
						iconOnly
						checked={g.enabled}
						onCheckedChange={(on) => setDraft({ ...g, enabled: on })}
					/>
				</SettingsRow>
				{GROUPS.map((name) => (
					<SettingsRow key={name} label={label(name)}>
						<Switch
							label={label(name)}
							iconOnly
							checked={g[name]}
							onCheckedChange={(on) => setDraft({ ...g, [name]: on })}
						/>
					</SettingsRow>
				))}
				<SettingsRow label={o.port}>
					<Input
						label={o.port}
						type="number"
						min="1024"
						max="65535"
						className="w-28"
						value={port ?? String(g.port)}
						onChange={(e) => setPort(e.target.value)}
					/>
				</SettingsRow>
				<SettingsRow label={o.tools}>
					<span className="flex max-w-lg flex-wrap gap-x-3">
						{s.tools.map((tool) => (
							<Checkbox
								key={tool}
								label={tool}
								checked={g.allowedTools.includes(tool)}
								onCheckedChange={(on) => toggleTool(tool, on)}
							/>
						))}
					</span>
				</SettingsRow>
				<div className="flex flex-wrap gap-2 px-3 py-2">
					<Button
						variant="secondary"
						disabled={draft === null && port === null}
						onClick={() => void save()}
					>
						{o.save}
					</Button>
					<Button
						variant="secondary"
						disabled={!s.running}
						onClick={() =>
							void attempt(async () =>
								format(o.wired, { path: await unwrap(commands.mcpOutsideWire()) }),
							)
						}
					>
						{o.wire}
					</Button>
					<Button
						variant="secondary"
						disabled={!s.running}
						onClick={() =>
							void attempt(async () => {
								await navigator.clipboard.writeText(await unwrap(commands.mcpOutsideToken()));
								return o.copied;
							})
						}
					>
						<ClipboardIcon size={14} />
						{o.token}
					</Button>
				</div>
				{note ? (
					<p role="status" className="px-3 pb-2 text-ui text-success-text">
						{note}
					</p>
				) : null}
				{s.error || error ? (
					<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
						{error ?? s.error}
					</p>
				) : null}
			</div>
			{(elsewhere.data ?? []).length > 0 ? (
				<div className="flex flex-col rounded-lg border bg-surface-1 shadow-1">
					<h3 className="px-3 pt-2 text-12 font-medium text-n-11">{o.elsewhere}</h3>
					{(elsewhere.data ?? []).map((e) => (
						<SettingsRow key={`${e.source}/${e.name}`} label={`${e.name} (${e.source})`}>
							<span className="font-mono text-12 text-n-11">
								{[e.command, ...e.args].join(" ")}
							</span>
							<IconButton
								label={format(o.import, { name: e.name })}
								onClick={() =>
									void attempt(async () => {
										await unwrap(commands.mcpElsewhereImport(e.source, e.name));
										await qc.invalidateQueries({ queryKey: ["mcp"] });
										return format(o.imported, { name: e.name });
									})
								}
							>
								<ArrowDownTrayIcon size={14} />
							</IconButton>
						</SettingsRow>
					))}
				</div>
			) : null}
		</section>
	);
}
