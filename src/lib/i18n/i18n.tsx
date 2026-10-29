import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { en, type Messages } from "./en";
import { fr } from "./fr";

export type Lang = "en" | "fr";
const KEY = "shipyard.lang";
const catalogues: Record<Lang, Messages> = { en, fr };

/** Replace each `{name}` with the value of `vars.name`. */
export function format(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

function initialLang(): Lang {
	const stored = localStorage.getItem(KEY);
	if (stored === "en" || stored === "fr") return stored;
	return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

type Ctx = { t: Messages; lang: Lang; setLang: (lang: Lang) => void };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
	const [lang, setLang] = useState<Lang>(initialLang);

	useEffect(() => {
		document.documentElement.lang = lang;
		localStorage.setItem(KEY, lang);
	}, [lang]);

	const value = useMemo(() => ({ t: catalogues[lang], lang, setLang }), [lang]);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
	const ctx = useContext(I18nContext);
	if (!ctx) throw new Error("useI18n needs I18nProvider");
	return ctx;
}
