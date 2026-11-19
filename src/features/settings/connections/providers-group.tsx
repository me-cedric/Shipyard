import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Provider, type TestOutcome, unwrap } from "@/lib/ipc";
import { useMenus } from "@/lib/menus";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { LinkButton } from "@/ui/atoms/link-button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CheckIcon } from "@/ui/icons";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { SecretInput } from "@/ui/molecules/secret-input";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { SetupCard, StatePill } from "../parts";
import { LINE } from "./fold";
import { providerKeys, useProviders } from "./keys";

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
		<form onSubmit={save} className="flex flex-col">
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
			{error ? <ErrorNotice error={error} className="px-6 pt-2 text-ui text-danger-text" /> : null}
			<div className="flex gap-2 px-6 py-2">
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
		<section aria-label={t.connections.provider.models} className="pb-2">
			{models.error || error ? (
				<ErrorNotice error={error ?? models.error} className="px-6" />
			) : null}
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

type Panel = "models" | "remove" | null;

/** One provider: its name and Edit. Edit opens the form with Test, Models and Remove. */
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
	const [open, setOpen] = useState(false);
	const [panel, setPanel] = useState<Panel>(null);
	const [result, setResult] = useState<TestOutcome | null>(null);
	const [testing, setTesting] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const menu = useMenus();

	const edit = (next: boolean) => {
		setOpen(next);
		if (!next) setPanel(null);
		onForm(next);
	};
	const show = (next: Panel) => {
		if (!open) edit(true);
		setPanel(panel === next ? null : next);
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
			onForm(false);
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
		<ContextMenu
			items={menu("connection", {
				test: () => void test(),
				edit: () => edit(true),
				remove: () => show("remove"),
			})}
		>
			{/* biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box */}
			<div role="group" aria-label={p.name} className={LINE}>
				<Row>
					<span title={p.model} className="min-w-0 flex-1 font-semibold">
						{p.name}
					</span>
					{p.state === "untested" ? (
						<span className="sr-only">{t.connections.state.untested}</span>
					) : (
						<StatePill state={p.state === "passed" ? "ready" : "fix"}>
							{t.connections.state[p.state]}
						</StatePill>
					)}
					<Button
						variant="secondary"
						aria-expanded={open}
						disabled={formOpen && !open}
						onClick={() => edit(!open)}
					>
						{t.connections.edit}
					</Button>
				</Row>
				{result && text ? (
					<p role="status" className="flex items-center gap-2 px-6 pb-2 text-ui">
						<StatusDot
							status={result.kind === "passed" ? "success" : "danger"}
							label={t.connections.state[result.kind === "passed" ? "passed" : "failed"]}
						/>
						{text}
					</p>
				) : null}
				{error ? (
					<ErrorNotice error={error} className="px-6 pb-2 text-ui text-danger-text" />
				) : null}
				{open ? (
					<>
						<div className="flex flex-wrap gap-2 px-6 pb-2">
							<Button variant="secondary" disabled={testing} onClick={() => void test()}>
								{t.connections.test}
							</Button>
							<Button
								variant="secondary"
								aria-expanded={panel === "models"}
								onClick={() => show("models")}
							>
								{t.connections.provider.models}
							</Button>
							<Button
								variant="secondary"
								aria-expanded={panel === "remove"}
								onClick={() => show("remove")}
							>
								{t.connections.remove}
							</Button>
						</div>
						{panel === "models" ? <Models provider={p} /> : null}
						{panel === "remove" ? (
							<div className="flex gap-2 px-6 pb-2">
								<Button variant="danger" onClick={() => void remove()}>
									{t.connections.confirm}
								</Button>
								<Button variant="ghost" onClick={() => setPanel(null)}>
									{t.connections.cancel}
								</Button>
							</div>
						) : null}
						<ProviderForm
							provider={p}
							onDone={() => {
								setResult(null);
								edit(false);
							}}
						/>
					</>
				) : null}
			</div>
		</ContextMenu>
	);
}

/** The model providers of this computer, and the form of a new one. */
export function ProvidersGroup({
	formOpen,
	onForm,
}: {
	formOpen: boolean;
	onForm: (open: boolean) => void;
}) {
	const { t } = useI18n();
	const rows = useProviders().data ?? [];
	const [adding, setAdding] = useState(false);
	const add = (next: boolean) => {
		setAdding(next);
		onForm(next);
	};
	return (
		<SetupCard id="connections-provider" title={t.connections.group.provider}>
			{rows.map((p) => (
				<ProviderRow key={p.id} provider={p} formOpen={formOpen} onForm={onForm} />
			))}
			{adding ? (
				<div className={LINE}>
					<ProviderForm onDone={() => add(false)} />
				</div>
			) : (
				<Row>
					<LinkButton disabled={formOpen} onClick={() => add(true)}>
						{t.personal.setup.addProvider}
					</LinkButton>
				</Row>
			)}
		</SetupCard>
	);
}
