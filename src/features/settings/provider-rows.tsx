import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Provider, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ConnectionRow } from "@/ui/molecules/connection-row";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { providerKeys } from "./connections/keys";

/** The official page where a person makes a key. `url` is the fixed address of the API. */
const KEYED = [
	{
		id: "openai",
		name: "OpenAI",
		url: "https://api.openai.com/v1",
		page: "https://platform.openai.com/api-keys",
	},
	{
		id: "anthropic",
		name: "Anthropic",
		url: "https://api.anthropic.com/v1",
		page: "https://console.anthropic.com/settings/keys",
	},
	{
		id: "mistral",
		name: "Mistral",
		url: "https://api.mistral.ai/v1",
		page: "https://console.mistral.ai/api-keys",
	},
	{
		id: "google",
		name: "Google AI Studio",
		url: "https://generativelanguage.googleapis.com/v1beta/openai",
		page: "https://aistudio.google.com/apikey",
	},
	// Azure has one address for each resource (Q-132: a pasted key, no sign-in yet).
	{
		id: "azure",
		name: "Azure OpenAI",
		url: "",
		page: "https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI",
	},
] as const;

const OPENROUTER = "https://openrouter.ai/api/v1";
const localKeys = ["providers", "local"] as const;

/**
 * The provider rows of Settings / Agents and rules (spec `provider-sign-in`): OpenRouter signs in
 * in the browser, a local runtime that answers is added with one click, and the other providers
 * take a pasted key that Shipyard tests before it keeps it. Rows only: the parent gives the panel.
 */
export function ProviderRows() {
	const { t } = useI18n();
	const p = t.settings.providers;
	const qc = useQueryClient();
	const { failure, run } = useGuard();
	const [waiting, setWaiting] = useState(false);
	const [form, setForm] = useState<string | null>(null);
	const [key, setKey] = useState("");
	const [address, setAddress] = useState("");
	const providers = useQuery({
		queryKey: providerKeys.list,
		queryFn: () => unwrap(commands.providersList()),
	});
	const runtimes = useQuery({
		queryKey: localKeys,
		queryFn: () => unwrap(commands.localRuntimesList()),
	});
	const all = providers.data ?? [];
	const refresh = () => qc.invalidateQueries({ queryKey: providerKeys.list });
	const ready = (match: (x: Provider) => boolean) => all.some((x) => match(x) && x.secret);

	const signIn = () =>
		run(async () => {
			setWaiting(true);
			try {
				await unwrap(commands.providersOpenrouterSignIn(true));
			} finally {
				setWaiting(false);
				await refresh();
			}
		});
	const save = (id: string) =>
		run(async () => {
			await unwrap(commands.providersKeySave(id, key, address.trim() || null, true));
			setKey("");
			setAddress("");
			setForm(null);
			await refresh();
		});
	const add = (id: string) =>
		run(async () => {
			await unwrap(commands.localRuntimesAdd(id, true));
			await refresh();
		});

	const openrouterReady = ready((x) => x.url === OPENROUTER);
	return (
		<>
			<ConnectionRow
				status={openrouterReady ? "info" : "warning"}
				statusLabel={waiting ? p.waiting : openrouterReady ? p.ready : p.noKey}
				name="OpenRouter"
				actions={
					waiting ? (
						<Button onClick={() => void commands.providersOpenrouterCancel()}>{p.cancel}</Button>
					) : openrouterReady ? null : (
						<Button onClick={() => void signIn()}>{p.signIn}</Button>
					)
				}
			/>
			{KEYED.map((k) => {
				const isReady = ready((x) => (k.url ? x.url === k.url : x.url.includes(".azure.com/")));
				const open = form === k.id;
				return (
					<ConnectionRow
						key={k.id}
						status={isReady ? "info" : "warning"}
						statusLabel={isReady ? p.ready : p.noKey}
						name={k.name}
						actions={
							<>
								<Button onClick={() => void commands.openLink(k.page)}>{p.getKey}</Button>
								<Button
									aria-expanded={open}
									onClick={() => {
										setKey("");
										setAddress("");
										setForm(open ? null : k.id);
									}}
								>
									{isReady ? p.replaceKey : p.pasteKey}
								</Button>
							</>
						}
					>
						{open ? (
							<form
								className="flex flex-wrap items-end gap-2 border-t px-3 py-2"
								onSubmit={(e) => {
									e.preventDefault();
									void save(k.id);
								}}
							>
								{k.url ? null : (
									<Input
										label={format(p.address, { name: k.name })}
										value={address}
										onChange={(e) => setAddress(e.target.value)}
										className="w-72"
									/>
								)}
								<Input
									autoFocus
									label={format(p.key, { name: k.name })}
									type="password"
									autoComplete="off"
									value={key}
									onChange={(e) => setKey(e.target.value)}
									className="w-72"
								/>
								<Button type="submit" variant="primary" disabled={!key.trim()}>
									{p.save}
								</Button>
							</form>
						) : null}
					</ConnectionRow>
				);
			})}
			{(runtimes.data ?? []).map((r) => {
				const added = all.some((x) => x.url === r.url);
				return (
					<ConnectionRow
						key={r.id}
						status="info"
						statusLabel={added ? p.added : p.running}
						name={r.name}
						product={r.model}
						actions={added ? null : <Button onClick={() => void add(r.id)}>{p.add}</Button>}
					/>
				);
			})}
			<ErrorNotice error={failure} className="px-3" />
		</>
	);
}
