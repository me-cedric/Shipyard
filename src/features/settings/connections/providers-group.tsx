import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Provider, type TestOutcome, unwrap } from "@/lib/ipc";
import { useMenus } from "@/lib/menus";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { ArrowPathIcon, CheckIcon, Cog6ToothIcon, CpuChipIcon, XMarkIcon } from "@/ui/icons";
import { ConnectionRow } from "@/ui/molecules/connection-row";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SecretInput } from "@/ui/molecules/secret-input";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { providerKeys, useProviders } from "./keys";

const STATE_SHAPE: Record<Provider["state"], Status> = {
	untested: "idle",
	passed: "success",
	failed: "danger",
};

/** Add form, or edit form of one provider. The key field is write-only. */
export function ProviderForm({ provider, onDone }: { provider?: Provider; onDone: () => void }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	// After an add, a retry edits the new provider, so a failed key never makes a duplicate.
	const [id, setId] = useState(provider?.id);
	const [name, setName] = useState(provider?.name ?? "");
	const [url, setUrl] = useState(provider?.url ?? "");
	const [model, setModel] = useState(provider?.model ?? "");
	const [secret, setSecret] = useState("");
	const [error, setError] = useState<unknown>(null);
	const [busy, setBusy] = useState(false);
	const f = t.connections.field;

	const save = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const draft = { name, url, model };
			const saved = await unwrap(
				id ? commands.providersEdit(id, draft) : commands.providersAdd(draft),
			);
			setId(saved.id);
			if (secret.trim()) await unwrap(commands.providersSetSecret(saved.id, secret));
			onDone();
		} catch (err) {
			setError(err);
		} finally {
			setBusy(false);
			await qc.invalidateQueries({ queryKey: providerKeys.list });
		}
	};

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
			<SettingsRow label={f.url}>
				<Input
					label={f.url}
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					className="w-64"
				/>
			</SettingsRow>
			<SettingsRow label={f.model}>
				<Input
					label={f.model}
					value={model}
					onChange={(e) => setModel(e.target.value)}
					className="w-64"
				/>
			</SettingsRow>
			<SettingsRow label={f.secret}>
				<SecretInput
					label={f.secret}
					saved={provider?.secret ?? false}
					value={secret}
					onChange={setSecret}
					className="w-64"
				/>
			</SettingsRow>
			{error ? <ErrorNotice error={error} className="px-3 pt-2 text-ui text-danger-text" /> : null}
			<div className="flex gap-2 px-3 py-2">
				<Button
					type="submit"
					variant="primary"
					disabled={busy || !name.trim() || !url.trim() || !model.trim()}
				>
					{t.connections.save}
				</Button>
				<Button variant="ghost" onClick={onDone}>
					{t.connections.cancel}
				</Button>
			</div>
		</form>
	);
}

/** The model ids that the provider lists. A click keeps one as the model. */
function Models({ provider: p }: { provider: Provider }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [error, setError] = useState<unknown>(null);
	const models = useQuery({
		queryKey: providerKeys.models(p.id),
		queryFn: () => unwrap(commands.providersModels(p.id)),
	});
	const use = async (model: string) => {
		try {
			setError(null);
			await unwrap(commands.providersEdit(p.id, { name: p.name, url: p.url, model }));
			await qc.invalidateQueries({ queryKey: providerKeys.list });
		} catch (e) {
			setError(e);
		}
	};
	return (
		<section aria-label={t.connections.provider.models} className="px-3 pb-2">
			{models.error || error ? <ErrorNotice error={error ?? models.error} /> : null}
			{(models.data ?? []).map((m) => (
				<SettingsRow key={m} icon={m === p.model ? <CheckIcon size={14} /> : undefined} label={m}>
					<Button
						variant="ghost"
						disabled={m === p.model}
						onClick={() => void use(m)}
						aria-label={format(t.connections.provider.use, { name: m })}
					>
						{t.connections.edit}
					</Button>
				</SettingsRow>
			))}
		</section>
	);
}

type Panel = "edit" | "models" | "remove" | null;

function ProviderRow({
	provider: p,
	formOpen,
	onForm,
}: {
	provider: Provider;
	formOpen: boolean;
	onForm: (open: boolean) => void;
}) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [panel, setPanel] = useState<Panel>(null);
	const [result, setResult] = useState<TestOutcome | null>(null);
	const [testing, setTesting] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const menu = useMenus();

	const show = (next: Panel) => {
		const to = panel === next ? null : next;
		setPanel(to);
		onForm(to === "edit");
	};
	const test = async () => {
		setTesting(true);
		setError(null);
		try {
			setResult(await unwrap(commands.providersTest(p.id)));
		} catch (e) {
			setError(e);
		} finally {
			setTesting(false);
			await qc.invalidateQueries({ queryKey: providerKeys.list });
		}
	};
	const remove = async () => {
		try {
			setError(null);
			await unwrap(commands.providersRemove(p.id));
			await qc.invalidateQueries({ queryKey: providerKeys.list });
		} catch (e) {
			setError(e);
		}
	};
	const text = result
		? format(t.connections.result[result.kind], {
				account: result.kind === "passed" ? result.account : "",
				scope: result.kind === "missing-scope" ? result.scope : "",
				reason: result.kind === "failed" ? result.reason : "",
			})
		: null;

	return (
		<ConnectionRow
			menu={menu("connection", {
				test: () => void test(),
				edit: () => show("edit"),
				remove: () => show("remove"),
			})}
			status={STATE_SHAPE[p.state]}
			statusLabel={t.connections.state[p.state]}
			name={p.name}
			product={p.model}
			actions={
				<>
					<IconButton label={t.connections.test} disabled={testing} onClick={test}>
						<ArrowPathIcon size={14} />
					</IconButton>
					<IconButton label={t.connections.provider.models} onClick={() => show("models")}>
						<CpuChipIcon size={14} />
					</IconButton>
					<IconButton
						label={t.connections.edit}
						disabled={formOpen && panel !== "edit"}
						onClick={() => show("edit")}
					>
						<Cog6ToothIcon size={14} />
					</IconButton>
					<IconButton label={t.connections.remove} onClick={() => show("remove")}>
						<XMarkIcon size={14} />
					</IconButton>
				</>
			}
		>
			{result && text ? (
				<p role="status" className="flex items-center gap-2 px-3 pb-2 text-ui">
					<StatusDot
						status={result.kind === "passed" ? "success" : "danger"}
						label={t.connections.state[result.kind === "passed" ? "passed" : "failed"]}
					/>
					{text}
				</p>
			) : null}
			{error ? <ErrorNotice error={error} className="px-3 pb-2 text-ui text-danger-text" /> : null}
			{panel === "edit" ? (
				<ProviderForm
					provider={p}
					onDone={() => {
						setPanel(null);
						setResult(null);
						onForm(false);
					}}
				/>
			) : null}
			{panel === "models" ? <Models provider={p} /> : null}
			{panel === "remove" ? (
				<div className="flex gap-2 px-3 pb-2">
					<Button variant="danger" onClick={() => void remove()}>
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

export function ProvidersGroup({
	formOpen,
	onForm,
}: {
	formOpen: boolean;
	onForm: (open: boolean) => void;
}) {
	const { t } = useI18n();
	const rows = useProviders().data ?? [];
	if (rows.length === 0) return null;
	return (
		<section aria-labelledby="connections-provider" className="flex flex-col gap-2">
			<h2 id="connections-provider" className="px-1 text-12 font-medium text-n-11">
				{format(t.count, { name: t.connections.group.provider, count: rows.length })}
			</h2>
			{rows.map((p) => (
				<ProviderRow key={p.id} provider={p} formOpen={formOpen} onForm={onForm} />
			))}
		</section>
	);
}
