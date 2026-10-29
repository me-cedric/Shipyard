import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
	type Connection_Serialize,
	type ConnectionGroup,
	type ConnectionKind,
	commands,
	unwrap,
} from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { SecretInput } from "@/ui/molecules/secret-input";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { connectionKeys } from "./keys";

export const GROUPS: ConnectionGroup[] = ["tracker", "forge"];

/** The products of each group. A Linear tracker has no address. */
export const KINDS: Record<ConnectionGroup, ConnectionKind[]> = {
	tracker: ["jira-cloud", "jira-data-center", "github", "gitlab", "azure-dev-ops", "linear"],
	forge: ["github", "gitlab", "azure-dev-ops"],
};

/** Add form, or edit form of one connection. The secret field is write-only. */
export function ConnectionForm({
	connection,
	onDone,
}: {
	connection?: Connection_Serialize;
	onDone: () => void;
}) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const editing = connection !== undefined;
	// After an add, a retry edits the new connection, so a failed secret never makes a duplicate.
	const [id, setId] = useState(connection?.id);
	const [group, setGroup] = useState<ConnectionGroup>(connection?.group ?? "tracker");
	const [kind, setKind] = useState<ConnectionKind>(connection?.kind ?? "jira-cloud");
	const [name, setName] = useState(connection?.name ?? "");
	const [url, setUrl] = useState(connection?.url ?? "");
	const [user, setUser] = useState(connection?.user ?? "");
	const [secret, setSecret] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const noUrl = group === "tracker" && kind === "linear";
	const needsUser = group === "tracker" && kind === "jira-cloud";

	const pickGroup = (g: ConnectionGroup) => {
		setGroup(g);
		if (!KINDS[g].includes(kind)) setKind(KINDS[g][0] ?? kind);
	};

	const save = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const draft = { name, group, kind, url: noUrl ? "" : url, user: needsUser ? user : null };
			const saved = await unwrap(
				id ? commands.connectionsEdit(id, draft) : commands.connectionsAdd(draft),
			);
			setId(saved.id);
			if (secret.trim()) await unwrap(commands.connectionsSetSecret(saved.id, secret));
			onDone();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
			await qc.invalidateQueries({ queryKey: connectionKeys.list });
		}
	};

	const f = t.connections.field;
	return (
		<form onSubmit={save} className="flex flex-col border-b">
			<SettingsRow label={f.name}>
				<Input
					label={f.name}
					value={name}
					onChange={(e) => setName(e.target.value)}
					className="w-64"
				/>
			</SettingsRow>
			{editing ? null : (
				<>
					<SettingsRow label={f.type}>
						<Select
							label={f.type}
							value={group}
							onValueChange={(v) => pickGroup(v === "forge" ? "forge" : "tracker")}
							items={GROUPS.map((g) => ({ value: g, label: t.connections.type[g] }))}
						/>
					</SettingsRow>
					<SettingsRow label={f.kind}>
						<Select
							label={f.kind}
							value={kind}
							onValueChange={(v) => setKind(v as ConnectionKind)}
							items={KINDS[group].map((k) => ({
								value: k,
								label: (t.connections.kind[group] as Record<string, string>)[k] ?? k,
							}))}
						/>
					</SettingsRow>
				</>
			)}
			{noUrl ? null : (
				<SettingsRow label={f.url}>
					<Input
						label={f.url}
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						className="w-64"
					/>
				</SettingsRow>
			)}
			{needsUser ? (
				<SettingsRow label={f.user}>
					<Input
						label={f.user}
						value={user}
						onChange={(e) => setUser(e.target.value)}
						className="w-64"
					/>
				</SettingsRow>
			) : null}
			<SettingsRow label={f.secret}>
				<SecretInput
					label={f.secret}
					saved={connection?.secret ?? false}
					value={secret}
					onChange={setSecret}
					className="w-64"
				/>
			</SettingsRow>
			{error ? (
				<p role="alert" className="px-3 pt-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="flex gap-2 px-3 py-2">
				<Button type="submit" variant="primary" disabled={busy || !name.trim()}>
					{t.connections.save}
				</Button>
				<Button variant="ghost" onClick={onDone}>
					{t.connections.cancel}
				</Button>
			</div>
		</form>
	);
}
