import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { commands, type Lang, unwrap } from "@/lib/ipc";
import { en, type Messages } from "./en";
import { fr } from "./fr";

export type { Lang };

const catalogues: Record<Lang, Messages> = { en, fr };

/** Replace each `{name}` with the value of `vars.name`. */
export function format(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const systemLang = (): Lang => (navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en");

type Ctx = { t: Messages; lang: Lang; setLang: (lang: Lang) => void; loaded: boolean };
const I18nContext = createContext<Ctx | null>(null);

/** The language lives in the preferences of the app data folder. The system language is the default. */
export function I18nProvider({ children }: { children: ReactNode }) {
	const [lang, setLangState] = useState<Lang>(systemLang);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		unwrap(commands.prefsGet())
			.then((p) => p.lang && setLangState(p.lang))
			.catch((e) => console.error(e))
			.finally(() => setLoaded(true));
	}, []);

	useEffect(() => {
		document.documentElement.lang = lang;
	}, [lang]);

	const setLang = useCallback((next: Lang) => {
		setLangState(next);
		unwrap(commands.prefsSet({ lang: next })).catch((e) => console.error(e));
	}, []);

	const value = useMemo(
		() => ({ t: catalogues[lang], lang, setLang, loaded }),
		[lang, setLang, loaded],
	);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
	const ctx = useContext(I18nContext);
	if (!ctx) throw new Error("useI18n needs I18nProvider");
	return ctx;
}
