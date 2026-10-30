import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type McpServer, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import type { Status } from "@/ui/atoms/status-dot";
import {
	ArrowDownTrayIcon,
	Cog6ToothIcon,
	PlayIcon,
	PlusIcon,
	StopIcon,
	XMarkIcon,
} from "@/ui/icons";
import { ConnectionRow } from "@/ui/molecules/connection-row";
import { SecretInput } from "@/ui/molecules/secret-input";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { mcpKeys, message, useMcpServers } from "./keys";

const STATE_SHAPE: Record<McpServer["state"]["state"], Status> = {
	stopped: "idle",
	starting: "active",
	running: "success",
	failed: "danger",
};

const CUSTOM = "custom";

/** The fields of a server: a value left empty keeps the saved one. A secret shows no value. */
function Fields({
	server: s,
	onSave,
	children,
}: {
	server: McpServer;
	onSave: (values: Record<string, string>) => Promise<void>;
	children?: React.ReactNode;
}) {
	const { t } = useI18n();
	const [values, setValues] = useState<Record<string, string>>({});
	return (
		<>
			{s.fields.map((f) => (
				<SettingsRow key={f.key} label={f.label}>
					<SecretInput
						label={f.label}
						plain={!f.secret}
						saved={s.filled.includes(f.key)}
						value={values[f.key] ?? ""}
						onChange={(v) => setValues({ ...values, [f.key]: v })}
						className="w-64"
					/>
				</SettingsRow>
			))}
			{children}
			<div className="flex gap-2 px-3 py-2">
				<Button variant="primary" onClick={() => void onSave(values)}>
					{t.connections.save}
				</Button>
			</div>
		</>
	);
}

type Panel = "edit" | "remove" | null;

function McpRow({
	server: s,
	formOpen,
	onForm,
}: {
	server: McpServer;
	formOpen: boolean;
	onForm: (open: boolean) => void;
}) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [panel, setPanel] = useState<Panel>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const live = s.state.state === "running" || s.state.state === "starting";

	const run = async (job: () => Promise<unknown>) => {
		setError(null);
		setBusy(true);
		try {
			await job();
		} catch (e) {
			setError(message(e));
		} finally {
			setBusy(false);
			await qc.invalidateQueries({ queryKey: mcpKeys.list });
		}
	};
	const show = (next: Panel) => {
		const to = panel === next ? null : next;
		setPanel(to);
		onForm(to === "edit");
	};
	// While the start waits, the list polls and shows "starting".
	const start = () => run(() => unwrap(commands.mcpStart(s.id)));

	return (
		<ConnectionRow
			status={STATE_SHAPE[s.state.state]}
			statusLabel={t.connections.mcp.state[s.state.state]}
			name={s.label}
			product={s.custom ? t.connections.mcp.custom : undefined}
			actions={
				<>
					{live ? (
						<IconButton
							label={t.connections.mcp.stop}
							disabled={s.state.state === "starting"}
							onClick={() => run(() => unwrap(commands.mcpStop(s.id)))}
						>
							<StopIcon size={14} />
						</IconButton>
					) : (
						<IconButton
							label={t.connections.mcp.start}
							disabled={busy || s.missing.length > 0}
							onClick={start}
						>
							<PlayIcon size={14} />
						</IconButton>
					)}
					{s.fields.length > 0 ? (
						<IconButton
							label={t.connections.edit}
							disabled={formOpen && panel !== "edit"}
							onClick={() => show("edit")}
						>
							<Cog6ToothIcon size={14} />
						</IconButton>
					) : null}
					<IconButton label={t.connections.remove} onClick={() => show("remove")}>
						<XMarkIcon size={14} />
					</IconButton>
				</>
			}
		>
			{s.missing.map((d) => (
				<p key={d.command} className="flex items-center gap-2 px-3 pb-2 text-ui text-warning-text">
					{format(t.connections.mcp.missing, { name: d.label })}
					{d.installable ? (
						<IconButton
							label={format(t.connections.mcp.install, { name: d.label })}
							disabled={busy}
							onClick={() => run(() => unwrap(commands.mcpInstall(d.command)))}
						>
							<ArrowDownTrayIcon size={14} />
						</IconButton>
					) : null}
				</p>
			))}
			{s.state.state === "failed" || error ? (
				<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
					{error ?? (s.state.state === "failed" ? s.state.reason : "")}
				</p>
			) : null}
			{panel === "edit" ? (
				<Fields
					server={s}
					onSave={async (values) => {
						await run(async () => {
							for (const [key, value] of Object.entries(values))
								if (value.trim()) await unwrap(commands.mcpSetField(s.id, key, value));
							setPanel(null);
							onForm(false);
						});
					}}
				/>
			) : null}
			{panel === "remove" ? (
				<div className="flex gap-2 px-3 pb-2">
					<Button
						variant="danger"
						onClick={() =>
							run(() => unwrap(s.custom ? commands.mcpRemove(s.id) : commands.mcpForget(s.id)))
						}
					>
						{t.connections.confirm}
					</Button>
					<Button variant="ghost" onClick={() => show("remove")}>
						{t.connections.cancel}
					</Button>
				</div>
			) : null}
		</ConnectionRow>
	);
}

/** Enabled servers, with their live state. Start all starts each one that can start. */
export function McpGroup({
	formOpen,
	onForm,
}: {
	formOpen: boolean;
	onForm: (open: boolean) => void;
}) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const rows = (useMcpServers().data ?? []).filter((s) => s.enabled);
	if (rows.length === 0) return null;
	const startable = rows.filter((s) => s.state.state !== "running" && s.missing.length === 0);
	const startAll = async () => {
		setError(null);
		const done = await Promise.allSettled(startable.map((s) => unwrap(commands.mcpStart(s.id))));
		const failed = done.find((d) => d.status === "rejected");
		if (failed?.status === "rejected") setError(message(failed.reason));
		await qc.invalidateQueries({ queryKey: mcpKeys.list });
	};
	return (
		<section aria-labelledby="connections-mcp" className="flex flex-col gap-2">
			<div className="flex items-center justify-between px-1">
				<h2 id="connections-mcp" className="py-1 text-12 font-medium text-n-11">
					{format(t.count, { name: t.connections.group.mcp, count: rows.length })}
				</h2>
				<Button variant="ghost" disabled={startable.length === 0} onClick={() => void startAll()}>
					<PlayIcon size={14} />
					{t.connections.mcp.startAll}
				</Button>
			</div>
			{error ? (
				<p role="alert" className="px-3 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{rows.map((s) => (
				<McpRow key={s.id} server={s} formOpen={formOpen} onForm={onForm} />
			))}
		</section>
	);
}

type Variable = { key: string; value: string };

/** Add a server: one from the catalogue with its fields, or a custom one. */
export function McpAddForm({ onDone }: { onDone: () => void }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const catalogue = (useMcpServers().data ?? []).filter((s) => !s.custom && !s.enabled);
	const [pick, setPick] = useState<string | null>(null);
	const choice = pick ?? catalogue[0]?.id ?? CUSTOM;
	const server = catalogue.find((s) => s.id === choice);
	const [name, setName] = useState("");
	const [command, setCommand] = useState("");
	const [args, setArgs] = useState("");
	const [vars, setVars] = useState<Variable[]>([{ key: "", value: "" }]);
	const [error, setError] = useState<string | null>(null);
	const f = t.connections.field;

	const finish = async (job: () => Promise<void>) => {
		setError(null);
		try {
			await job();
			onDone();
		} catch (e) {
			setError(message(e));
		} finally {
			await qc.invalidateQueries({ queryKey: mcpKeys.list });
		}
	};
	const enable = async (id: string, values: Record<string, string> = {}) => {
		for (const [key, value] of Object.entries(values))
			if (value.trim()) await unwrap(commands.mcpSetField(id, key, value));
		await unwrap(commands.mcpEnable(id, true));
	};
	const addCustom = () =>
		finish(async () => {
			const id = await unwrap(
				commands.mcpAddCustom({
					id: null,
					name,
					description: "",
					command,
					args: args.split(/\s+/).filter(Boolean),
					env: vars.filter((v) => v.key.trim()).map((v) => ({ key: v.key.trim(), value: v.value })),
				}),
			);
			await unwrap(commands.mcpEnable(id, true));
		});

	return (
		<div className="flex flex-col border-b">
			<SettingsRow label={f.server}>
				<Select
					label={f.server}
					value={choice}
					onValueChange={setPick}
					items={[
						...catalogue.map((s) => ({ value: s.id, label: s.label })),
						{ value: CUSTOM, label: t.connections.mcp.custom },
					]}
				/>
			</SettingsRow>
			{server ? (
				<Fields
					// A new pick resets the typed values.
					key={server.id}
					server={server}
					onSave={(values) => finish(() => enable(server.id, values))}
				/>
			) : (
				<>
					<SettingsRow label={f.name}>
						<Input
							label={f.name}
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-64"
						/>
					</SettingsRow>
					<SettingsRow label={f.command}>
						<Input
							label={f.command}
							value={command}
							onChange={(e) => setCommand(e.target.value)}
							className="w-64"
						/>
					</SettingsRow>
					<SettingsRow label={f.args}>
						<Input
							label={f.args}
							value={args}
							onChange={(e) => setArgs(e.target.value)}
							className="w-64"
						/>
					</SettingsRow>
					{vars.map((v, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: rows have no id and are only appended
						<SettingsRow key={i} label={f.variable}>
							<Input
								label={f.variable}
								value={v.key}
								onChange={(e) =>
									setVars(vars.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
								}
								className="w-40"
							/>
							<SecretInput
								label={f.value}
								saved={false}
								value={v.value}
								onChange={(value) => setVars(vars.map((x, j) => (j === i ? { ...x, value } : x)))}
								className="w-40"
							/>
						</SettingsRow>
					))}
					<div className="flex gap-2 px-3 py-2">
						<IconButton
							label={f.variable}
							onClick={() => setVars([...vars, { key: "", value: "" }])}
						>
							<PlusIcon size={14} />
						</IconButton>
					</div>
					<div className="flex gap-2 px-3 pb-2">
						<Button
							variant="primary"
							disabled={!name.trim() || !command.trim()}
							onClick={() => void addCustom()}
						>
							{t.connections.save}
						</Button>
					</div>
				</>
			)}
			{error ? (
				<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="px-3 pb-2">
				<Button variant="ghost" onClick={onDone}>
					{t.connections.cancel}
				</Button>
			</div>
		</div>
	);
}
