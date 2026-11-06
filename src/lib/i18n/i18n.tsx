import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { commands, type Lang, type LanguagePack, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { de } from "./de";
import { en, type Messages } from "./en";
import { setErrorPack } from "./errors";
import { es } from "./es";
import { fr } from "./fr";
import { applyPack } from "./packs";

export type { Lang };

const catalogues: Record<Lang, Messages> = { en, fr, de, es };
/** The languages that ship with the app, in the order of the picker. */
export const LANGS: Lang[] = ["en", "fr", "de", "es"];

/** Replace each `{name}` with the value of `vars.name`. */
export function format(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const systemLang = (): Lang => {
	const code = navigator.language.toLowerCase().slice(0, 2);
	return LANGS.find((l) => l === code) ?? "en";
};

type Ctx = {
	t: Messages;
	/** The built-in language. With a pack, English: the language of each text the pack lacks. */
	lang: Lang;
	/** The language tag of the interface: the pack code, else `lang`. */
	code: string;
	setLang: (lang: Lang) => void;
	/** The code of the current language pack. Empty: none. */
	pack: string;
	setPack: (code: string) => void;
	/** The language packs of the library. */
	packs: LanguagePack[];
	setPacks: (packs: LanguagePack[]) => void;
	/** Each text that the pack does not translate shows with a marker. Not kept. */
	marked: boolean;
	setMarked: (on: boolean) => void;
	loaded: boolean;
};
const I18nContext = createContext<Ctx | null>(null);

/** The language lives in the preferences of the app data folder. The system language is the default. */
export function I18nProvider({ children }: { children: ReactNode }) {
	const [lang, setLangState] = useState<Lang>(systemLang);
	const [pack, setPackState] = useState("");
	const [packs, setPacks] = useState<LanguagePack[]>([]);
	const [marked, setMarked] = useState(false);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		Promise.all([
			unwrap(commands.prefsGet()).then((p) => {
				if (p.lang) setLangState(p.lang);
				setPackState(p.langPack ?? "");
			}),
			unwrap(commands.languageList()).then(setPacks),
		])
			.catch(logError)
			.finally(() => setLoaded(true));
	}, []);

	const active = packs.find((p) => p.code === pack);
	const applied = useMemo(() => active && applyPack(active, marked), [active, marked]);
	const code = active?.code ?? lang;

	useEffect(() => {
		document.documentElement.lang = code;
		setErrorPack(applied ?? { errors: {}, actions: {} });
	}, [code, applied]);

	const setLang = useCallback((next: Lang) => {
		setLangState(next);
		setPackState("");
		unwrap(commands.prefsSet({ lang: next, langPack: "" })).catch(logError);
	}, []);
	const setPack = useCallback((next: string) => {
		setPackState(next);
		unwrap(commands.prefsSet({ langPack: next })).catch(logError);
	}, []);

	const value = useMemo(
		() => ({
			t: applied?.t ?? catalogues[lang],
			lang: applied ? ("en" as const) : lang,
			code,
			setLang,
			pack: active ? pack : "",
			setPack,
			packs,
			setPacks,
			marked,
			setMarked,
			loaded,
		}),
		[applied, lang, code, setLang, active, pack, setPack, packs, marked, loaded],
	);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
	const ctx = useContext(I18nContext);
	if (!ctx) throw new Error("useI18n needs I18nProvider");
	return ctx;
}
