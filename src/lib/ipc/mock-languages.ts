// The mock of the language commands. It mirrors `crates/shipyard-store/src/languages.rs` and the
// check of `crates/shipyard-core/src/language.rs`: each fault names its field, and nothing is saved
// on a fault. The Rust tests of those files are the proof of the check; this copy serves the view tests.
import type { LanguagePack } from "./bindings";

export const PACK_PATH = "/mock/pt.json";
/** A pack that passes the file check, with a key that the English base does not have. */
export const UNKNOWN_KEY_PATH = "/mock/old-pt.json";
/** A pack that fails the file check. */
export const BAD_PACK_PATH = "/mock/bad-language.json";

export const SAMPLE_PACK: LanguagePack = {
	shipyardLanguage: 1,
	code: "pt",
	name: "Português",
	messages: { "prefs.language": "Idioma", "common.close": "Fechar" },
};

const BUILT_IN = ["en", "fr", "de", "es"];
const RESERVED = ["con", "aux", "nul", "prn"];
const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const KEY = /^[A-Za-z0-9._-]{1,200}$/;
const chars = (v: string) => [...v].length;

/** Each fault as `<field>: <reason>`, as the backend lists them. */
export function packFileFaults(p: LanguagePack): string[] {
	const out: string[] = [];
	if (p.shipyardLanguage !== 1)
		out.push(`shipyardLanguage: version ${p.shipyardLanguage} is not known, use 1`);
	if (!CODE.test(p.code) || p.code.length > 20 || RESERVED.includes(p.code.split("-")[0] ?? ""))
		out.push("code: use a language tag such as pt or pt-BR");
	else if (BUILT_IN.includes(p.code)) out.push(`code: ${p.code} ships with the app`);
	// biome-ignore lint/suspicious/noControlCharactersInRegex: the backend refuses a control character
	if (!p.name.trim() || chars(p.name) > 60 || /[\u0000-\u001f\u007f]/.test(p.name))
		out.push("name: use 1 to 60 characters");
	if (Object.keys(p.messages).length > 20_000) out.push("messages: use 20000 messages or fewer");
	for (const [k, v] of Object.entries(p.messages))
		if (!KEY.test(k)) out.push(`messages.${k}: not a message key`);
		else if (!v.trim() || chars(v) > 2000) out.push(`messages.${k}: use 1 to 2000 characters`);
	return out;
}

const check = (p: LanguagePack) => {
	const f = packFileFaults(p);
	if (f.length) throw f.join("\n");
};

export function languageRead(path: string): LanguagePack {
	if (path === BAD_PACK_PATH) check({ ...SAMPLE_PACK, code: "fr", name: "" });
	if (!path.endsWith(".json")) throw "the language file is not a file or is larger than 2 MB";
	const pack = structuredClone(SAMPLE_PACK);
	if (path === UNKNOWN_KEY_PATH) pack.messages["common.gone"] = "Removido";
	return pack;
}

export function languageAdd(library: LanguagePack[], p: LanguagePack): LanguagePack[] {
	check(p);
	return [...library.filter((x) => x.code !== p.code), p as LanguagePack].sort((a, b) =>
		a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
	);
}

export function languageExport(
	exported: Record<string, LanguagePack>,
	path: string,
	p: LanguagePack,
) {
	check(p);
	exported[path] = p as LanguagePack;
	return null;
}
