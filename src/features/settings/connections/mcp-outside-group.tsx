import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type McpGates_Serialize as Gates, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { Chip } from "@/ui/atoms/chip";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ClipboardIcon } from "@/ui/icons";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { SetupCard, SetupRow, StatePill, Toggle } from "../parts";
import { Fold } from "./fold";
import { message } from "./keys";
import { McpWiring, wiringKey } from "./mcp-wiring";

const GROUPS = [
	"reads",
	"writes",
	"git",
	"forge",
	"exec",
	"delivery",
	"tickets",
	"adrs",
	"qa",
	"workflows",
] as const;
const outsideKey = ["mcp", "outside"] as const;
const elsewhereKey = ["mcp", "elsewhere"] as const;

const useOutside = () =>
	useQuery({ queryKey: outsideKey, queryFn: () => unwrap(commands.mcpOutsideGet()) });

/** The address of the Shipyard MCP server with Copy. The address is no secret: the token has its own button. */
function Address({ url }: { url: string }) {
	const { t } = useI18n();
	const p = t.personal.setup;
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex min-h-15 flex-wrap items-center gap-2.5 px-6">
			<span className="mr-auto min-w-0 break-all font-mono text-ui">{url}</span>
			<Button
				variant="secondary"
				aria-label={p.copyAddress}
				onClick={() => {
					copyText(url);
					setCopied(true);
				}}
			>
				{copied ? p.copied : p.copy}
			</Button>
		</div>
	);
}

/** Setup / This computer: the state and the address of the server for outside agents, and the way to its page. */
export function OutsideCard() {
	const { t } = useI18n();
	const o = t.settings.outside;
	const s = useOutside().data;
	if (!s) return null;
	return (
		<SetupCard id="connections-outside" title={o.title}>
			<SetupRow label={t.personal.setup.outsideUse}>
				<StatePill state={s.running ? "ready" : "off"}>
					{s.running ? o.running : o.stopped}
				</StatePill>
			</SetupRow>
			<Address url={s.url} />
			<SetupRow label={t.personal.setup.share} href="/setup/computer?page=share" />
		</SetupCard>
	);
}

/**
 * Share Shipyard with other tools: the AI tools that can use the Shipyard MCP server, what they
 * may use, its address, and the servers of another tool. The port, the allow list and the tool
 * names are under More.
 */
export function McpOutsideGroup() {
	const { t } = useI18n();
	const o = t.settings.outside;
	const p = t.personal.setup;
	const qc = useQueryClient();
	const status = useOutside();
	const elsewhere = useQuery({
		queryKey: elsewhereKey,
		queryFn: () => unwrap(commands.mcpElsewhereList()),
	});
	const [draft, setDraft] = useState<Gates | null>(null);
	const [port, setPort] = useState<string | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pick, setPick] = useState<string | null>(null);
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
	const preset =
		g.allowedTools.length === 0
			? "all"
			: g.allowedTools.length === s.readOnly.length &&
					s.readOnly.every((x) => g.allowedTools.includes(x))
				? "read"
				: "custom";
	const setPreset = (v: string) => {
		if (v === "all") setDraft({ ...g, allowedTools: [] });
		if (v === "read") setDraft({ ...g, allowedTools: [...s.readOnly] });
	};
	const save = () =>
		attempt(async () => {
			await unwrap(commands.mcpOutsideSet({ ...g, port: Number(port ?? g.port) }));
			setDraft(null);
			setPort(null);
			await qc.invalidateQueries({ queryKey: outsideKey });
			// A new port or address makes a wired file out of date.
			await qc.invalidateQueries({ queryKey: wiringKey });
			return null;
		});
	const others = elsewhere.data ?? [];
	const keyOf = (e: (typeof others)[number]) => `${e.source}/${e.name}`;
	const chosen = others.find((e) => keyOf(e) === pick) ?? others[0];
	const apply = (
		<Button
			variant="secondary"
			disabled={draft === null && port === null}
			onClick={() => void save()}
		>
			{o.save}
		</Button>
	);
	return (
		<div className="flex flex-wrap items-start gap-6 px-4 pb-10">
			<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
				<McpWiring />
				<SetupCard
					id="connections-outside"
					title={p.mayUse}
					className="px-6 pb-6 [&>div:first-child]:px-0"
				>
					<div className="flex flex-wrap gap-2 pt-1.5">
						{GROUPS.map((name) => (
							<Chip
								key={name}
								selected={g[name]}
								onClick={() => setDraft({ ...g, [name]: !g[name] })}
							>
								{o[name]}
							</Chip>
						))}
					</div>
					<div className="flex flex-wrap items-center gap-2 pt-3">{apply}</div>
					{note ? (
						<p role="status" className="pt-2 text-ui text-success-text">
							{note}
						</p>
					) : null}
					{s.error || error ? (
						<p role="alert" className="pt-2 text-ui text-danger-text">
							{error ?? s.error}
						</p>
					) : null}
					<Fold label={t.ui.more} className="-mx-6 mt-3 border-t border-n-6">
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
						<SettingsRow label={o.allowList}>
							<Select
								label={o.allowList}
								value={preset}
								onValueChange={setPreset}
								items={[
									{ value: "all", label: o.allowAll },
									{ value: "read", label: o.allowRead },
									{ value: "custom", label: o.allowCustom },
								]}
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
						<div className="flex flex-wrap gap-2 px-6 py-2">
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
					</Fold>
				</SetupCard>
			</div>
			<div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
				<SetupCard title={p.address}>
					<Address url={s.url} />
					<SetupRow label={o.enabled}>
						<StatePill state={s.running ? "ready" : "off"}>
							{s.running ? o.running : o.stopped}
						</StatePill>
						<Toggle
							label={o.enabled}
							checked={g.enabled}
							onCheckedChange={(on) => setDraft({ ...g, enabled: on })}
						/>
					</SetupRow>
				</SetupCard>
				{chosen ? (
					<SetupCard title={p.bring}>
						<div className="flex flex-wrap items-center gap-2.5 px-6 pt-1.5 pb-4">
							<Select
								label={p.bringFrom}
								value={keyOf(chosen)}
								onValueChange={setPick}
								items={others.map((e) => ({
									value: keyOf(e),
									label: `${e.name} (${e.source})`,
								}))}
							/>
							<Button
								variant="primary"
								aria-label={format(o.import, { name: chosen.name })}
								title={[chosen.command, ...chosen.args].join(" ")}
								onClick={() =>
									void attempt(async () => {
										await unwrap(commands.mcpElsewhereImport(chosen.source, chosen.name));
										await qc.invalidateQueries({ queryKey: ["mcp"] });
										return format(o.imported, { name: chosen.name });
									})
								}
							>
								{p.import}
							</Button>
						</div>
					</SetupCard>
				) : null}
			</div>
		</div>
	);
}
