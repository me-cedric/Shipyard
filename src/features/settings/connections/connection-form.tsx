import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
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
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SecretInput } from "@/ui/molecules/secret-input";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { connectionKeys } from "./keys";

export const GROUPS: ConnectionGroup[] = ["tracker", "forge"];

/** The types of the add form: the two groups of this form, then the types that have their own. */
export const ADD_TYPES = [...GROUPS, "mcp", "provider"] as const;
export type AddType = (typeof ADD_TYPES)[number];

/** The products of each group. A Linear tracker has no address. */
export const KINDS: Record<ConnectionGroup, ConnectionKind[]> = {
	tracker: ["jira-cloud", "jira-data-center", "github", "gitlab", "azure-dev-ops", "linear"],
	forge: ["github", "gitlab", "azure-dev-ops"],
};

/**
 * The logins of `gh` and `glab` on this machine. One click makes a forge connection from a login:
 * the token goes from the tool to the keychain and is tested, and it never shows.
 */
function CliLogins({ onDone }: { onDone: () => void }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const logins = useQuery({
		queryKey: [...connectionKeys.list, "logins"],
		queryFn: () => unwrap(commands.connectionsDetect()),
	}).data;
	const [error, setError] = useState<unknown>(null);
	if (!logins?.length) return null;
	return (
		<div className="flex flex-col border-b">
			{logins.map((l) => (
				<SettingsRow key={`${l.tool}:${l.host}`} label={format(t.connections.login, l)}>
					<Button
						onClick={async () => {
							try {
								setError(null);
								await unwrap(commands.connectionsUseLogin(l.tool, l.host, true));
								await qc.invalidateQueries({ queryKey: connectionKeys.list });
								onDone();
							} catch (e) {
								setError(e);
							}
						}}
					>
						{t.connections.useLogin}
					</Button>
				</SettingsRow>
			))}
			<ErrorNotice error={error} className="px-3 py-2" />
		</div>
	);
}

/** Add form, or edit form of one connection. The secret field is write-only. */
export function ConnectionForm({
	connection,
	initialGroup,
	onType,
	onDone,
}: {
	connection?: Connection_Serialize;
	initialGroup?: ConnectionGroup;
	/** The person picked a type that has another form: the parent swaps the form. */
	onType?: (type: "mcp" | "provider") => void;
	onDone: () => void;
}) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const editing = connection !== undefined;
	// After an add, a retry edits the new connection, so a failed secret never makes a duplicate.
	const [id, setId] = useState(connection?.id);
	const [group, setGroup] = useState<ConnectionGroup>(
		connection?.group ?? initialGroup ?? "tracker",
	);
	const [kind, setKind] = useState<ConnectionKind>(connection?.kind ?? "jira-cloud");
	const [name, setName] = useState(connection?.name ?? "");
	const [url, setUrl] = useState(connection?.url ?? "");
	const [user, setUser] = useState(connection?.user ?? "");
	const [secret, setSecret] = useState("");
	const [error, setError] = useState<unknown>(null);
	const [busy, setBusy] = useState(false);
	// The name and the address come from the git remote of the project, once, into empty fields.
	const suggestion = useQuery({
		queryKey: [...connectionKeys.list, "suggest"],
		queryFn: () => unwrap(commands.connectionsSuggest()),
		enabled: !editing,
	}).data;
	const [prefilled, setPrefilled] = useState(false);
	useEffect(() => {
		if (!suggestion || prefilled || editing || name || url) return;
		setPrefilled(true);
		setName(suggestion.name);
		setUrl(suggestion.url);
		const k = suggestion.kind;
		if (k && KINDS[group].includes(k)) setKind(k);
	}, [suggestion, prefilled, editing, name, url, group]);

	const noUrl = group === "tracker" && kind === "linear";
	const needsUser = group === "tracker" && kind === "jira-cloud";

	const pickGroup = (g: ConnectionGroup) => {
		setPrefilled(true);
		setGroup(g);
		if (!KINDS[g].includes(kind)) setKind(KINDS[g][0] ?? kind);
	};
	// Another product is not at the address of the remote: drop what the remote gave.
	const pickKind = (k: ConnectionKind) => {
		setPrefilled(true);
		setKind(k);
		if (suggestion && k !== suggestion.kind) {
			if (url === suggestion.url) setUrl("");
			if (name === suggestion.name) setName("");
		}
	};
	const tokenPage = async () => {
		try {
			await unwrap(commands.connectionsOpenTokenPage(kind, noUrl ? "" : url));
		} catch (err) {
			setError(err);
		}
	};
	const canOpenPage = noUrl || kind === "jira-cloud" || url.trim().startsWith("https://");

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
			// Save runs the test: a wrong token shows here, and the form stays for the fix.
			if (secret.trim() || saved.secret) {
				const out = await unwrap(commands.connectionsTest(saved.id));
				if (out.kind !== "passed") {
					setError(
						format(t.connections.result[out.kind], {
							account: "",
							scope: out.kind === "missing-scope" ? out.scope : "",
							reason: out.kind === "failed" ? out.reason : "",
						}),
					);
					return;
				}
			}
			onDone();
		} catch (err) {
			setError(err);
		} finally {
			setBusy(false);
			await qc.invalidateQueries({ queryKey: connectionKeys.list });
		}
	};

	const f = t.connections.field;
	return (
		<form onSubmit={save} className="flex flex-col border-b">
			{editing || group !== "forge" ? null : <CliLogins onDone={onDone} />}
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
							onValueChange={(v) =>
								v === "mcp" || v === "provider"
									? onType?.(v)
									: pickGroup(v === "forge" ? "forge" : "tracker")
							}
							items={ADD_TYPES.map((g) => ({ value: g, label: t.connections.type[g] }))}
						/>
					</SettingsRow>
					<SettingsRow label={f.kind}>
						<Select
							label={f.kind}
							value={kind}
							onValueChange={(v) => pickKind(v as ConnectionKind)}
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
			<SettingsRow label={t.settings.setup.token[kind]}>
				<span className="flex items-center gap-2">
					<SecretInput
						label={t.settings.setup.token[kind]}
						saved={connection?.secret ?? false}
						value={secret}
						onChange={setSecret}
						className="w-64"
					/>
					<Button variant="ghost" disabled={!canOpenPage} onClick={() => void tokenPage()}>
						{t.settings.setup.getToken}
					</Button>
				</span>
			</SettingsRow>
			<ErrorNotice error={error} className="px-3 pt-2" />
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
