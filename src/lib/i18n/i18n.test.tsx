import { act, render, screen, waitFor } from "@testing-library/react";
import { mockState } from "@/lib/ipc/mock";
import { de } from "./de";
import { en } from "./en";
import { actionLabels, errorMessages } from "./errors";
import { es } from "./es";
import { fr } from "./fr";
import { format, I18nProvider, LANGS, type Lang, useI18n } from "./i18n";
import { flatten } from "./packs";

const catalogues = { en, fr, de, es };

function Probe() {
	const { t, lang, setLang } = useI18n();
	return (
		<button type="button" onClick={() => setLang("fr")}>
			{lang}:{t.common.close}
		</button>
	);
}

describe("i18n", () => {
	it("switches to French and keeps it in the app data folder", async () => {
		render(
			<I18nProvider>
				<Probe />
			</I18nProvider>,
		);
		expect(await screen.findByRole("button")).toHaveTextContent("en:Close");
		act(() => screen.getByRole("button").click());
		expect(screen.getByRole("button")).toHaveTextContent("fr:Fermer");
		expect(document.documentElement.lang).toBe("fr");
		await waitFor(() => expect(mockState().prefs.lang).toBe("fr"));
	});

	it("starts in the stored language", async () => {
		mockState().prefs.lang = "fr";
		render(
			<I18nProvider>
				<Probe />
			</I18nProvider>,
		);
		await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("fr:Fermer"));
	});

	it("interpolates {name}", () => {
		expect(format("{name} ({count})", { name: "Go", count: 2 })).toBe("Go (2)");
	});
});

// REQ-015 and `languages` REQ-002: the built-in catalogues ship together. A missing or empty
// label fails here, in the build.
const leaves = (v: unknown, path = ""): [string, unknown][] =>
	v !== null && typeof v === "object"
		? Object.entries(v).flatMap(([k, x]) => leaves(x, path ? `${path}.${k}` : k))
		: [[path, v]];

describe.each([
	["French", fr],
	["German", de],
	["Spanish", es],
])("catalogues (REQ-015): %s", (_, catalogue) => {
	const enLeaves = leaves(en);
	const other = new Map(leaves(catalogue));

	it("has every English key and no other", () => {
		expect([...other.keys()].sort()).toEqual(enLeaves.map(([k]) => k).sort());
	});

	it("holds no empty label", () => {
		for (const [k, v] of [...enLeaves, ...other])
			if (typeof v === "string") expect(v, k).not.toBe("");
	});

	it("keeps the placeholders of English", () => {
		const slots = (v: unknown) => (typeof v === "string" ? (v.match(/\{\w+\}/g) ?? []).sort() : []);
		for (const [k, v] of enLeaves) expect(slots(other.get(k)), k).toEqual(slots(v));
	});
});

// `spec:app-redesign#REQ-027`: the language check. It reads the texts, not the keys.
const texts = (lang: Lang) =>
	Object.entries({
		...flatten(catalogues[lang]),
		...flatten(errorMessages[lang], "error"),
		...flatten(actionLabels[lang], "action"),
	});
const hits = (lang: Lang, word: RegExp) =>
	texts(lang)
		.filter(([, v]) => word.test(v))
		.map(([k, v]) => `${k}: ${v}`);

describe.each(LANGS)("plain words (REQ-027): %s", (lang) => {
	it("has each key of English", () => {
		expect(
			texts(lang)
				.map(([k]) => k)
				.sort(),
		).toEqual(
			texts("en")
				.map(([k]) => k)
				.sort(),
		);
	});

	it('says "issue tracker" and "code host", never "tracker" or "forge" alone', () => {
		expect(hits(lang, /(?<!issue[ -])\btrackers?\b/i)).toEqual([]);
		expect(hits(lang, /\bforges?\b/i)).toEqual([]);
	});

	it('says "recipe" and "crew", never "workflow" or "Factory"', () => {
		expect(hits(lang, /workflow|factory/i)).toEqual([]);
	});

	it("holds no translation of a banned word", () => {
		expect(hits(lang, /\busines?\b|fabrique|flux de travail/i)).toEqual([]);
		expect(hits(lang, /fabrik|arbeitsablauf/i)).toEqual([]);
		expect(hits(lang, /f[áa]brica|flujos? de trabajo/i)).toEqual([]);
	});
});

// The names of `q:Q-169` (English) and of the default of `q:Q-172` (French, German, Spanish).
it.each([
	["en", "Today Flow Plan Crew Library Code Setup", "Recipes"],
	["fr", "Aujourd'hui Flux Plan Équipe Bibliothèque Code Configuration", "Recettes"],
	["de", "Heute Ablauf Plan Team Bibliothek Code Einrichtung", "Rezepte"],
	["es", "Hoy Flujo Plan Equipo Biblioteca Código Configuración", "Recetas"],
] as const)("names the places and the recipes (REQ-027): %s", (lang, places, recipes) => {
	const t = catalogues[lang];
	expect(Object.values(t.ui.place).join(" ")).toBe(places);
	expect(t.crewPlace.views.crew).toBe(t.ui.place.crew);
	expect(t.crewPlace.views.recipes).toBe(recipes);
});
