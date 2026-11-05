// The mock of the provider rows (spec `provider-sign-in`). It mirrors `provider_keys.rs` and the
// OpenRouter part of `device_login.rs`: every write needs a click, a pasted key is tested before
// it is stored (a key that starts with `bad` fails the test and stores nothing), and the key goes
// to the mock keychain only.
import type { Provider } from "./bindings";
import { type MockAgents, providerAdd } from "./mock-agents";

const CLICK = "this change needs the click of a person";

const KEYED: Record<string, { name: string; url: string; model: string }> = {
	openai: { name: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
	anthropic: { name: "Anthropic", url: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" },
	mistral: { name: "Mistral", url: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
	google: {
		name: "Google AI Studio",
		url: "https://generativelanguage.googleapis.com/v1beta/openai",
		model: "gemini-2.5-flash",
	},
	azure: { name: "Azure OpenAI", url: "", model: "gpt-4o" },
};

/** The provider at `url`, made when it is new, with the key in the mock keychain when given. */
function store(
	m: MockAgents,
	secrets: Record<string, string>,
	d: { name: string; url: string; model: string },
	key: string | null,
): Provider {
	const url = d.url.trim().replace(/\/$/, "");
	const p = m.providers.find((x) => x.url === url) ?? providerAdd(m, { ...d, url });
	if (key) {
		secrets[p.id] = key;
		p.secret = true;
		p.state = "untested";
	}
	return p;
}

export function keySave(
	m: MockAgents,
	secrets: Record<string, string>,
	kind: string,
	key: string,
	url: string | null,
	click: boolean,
): Provider {
	if (!click) throw CLICK;
	const k = KEYED[kind];
	if (!k) throw `unknown provider: ${kind}`;
	const address = k.url || url?.trim();
	if (!address) throw "Azure needs the address of your resource: paste it, then save again";
	const value = key.trim();
	if (!value || value.length > 4096) throw "paste a key of 1 to 4096 characters";
	if (value.startsWith("bad"))
		throw `${k.name} did not accept the key: the token was rejected: wrong, expired or revoked. Check the key, then save again`;
	return store(m, secrets, { ...k, url: address }, value);
}

export function openrouterSignIn(
	m: MockAgents,
	secrets: Record<string, string>,
	click: boolean,
): Provider {
	if (!click) throw CLICK;
	return store(
		m,
		secrets,
		{ name: "OpenRouter", url: "https://openrouter.ai/api/v1", model: "openrouter/auto" },
		"sk-or-v1-mock",
	);
}

export function localAdd(m: MockAgents, id: string, click: boolean): Provider {
	if (!click) throw CLICK;
	const r = m.runtimes.find((x) => x.id === id);
	if (!r) throw "that runtime does not answer any more: start it, then try again";
	return store(m, {}, r, null);
}
