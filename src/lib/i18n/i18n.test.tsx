import { act, render, screen, waitFor } from "@testing-library/react";
import { mockState } from "@/lib/ipc/mock";
import { en } from "./en";
import { fr } from "./fr";
import { format, I18nProvider, useI18n } from "./i18n";

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

// REQ-015: both catalogues ship together. A missing or empty label fails here, in the build.
const leaves = (v: unknown, path = ""): [string, unknown][] =>
	v !== null && typeof v === "object"
		? Object.entries(v).flatMap(([k, x]) => leaves(x, path ? `${path}.${k}` : k))
		: [[path, v]];

describe("catalogues (REQ-015)", () => {
	const enLeaves = leaves(en);
	const frLeaves = new Map(leaves(fr));

	it("French has every English key and no other", () => {
		expect([...frLeaves.keys()].sort()).toEqual(enLeaves.map(([k]) => k).sort());
	});

	it("holds no empty label", () => {
		for (const [k, v] of [...enLeaves, ...frLeaves])
			if (typeof v === "string") expect(v, k).not.toBe("");
	});

	it("keeps the same placeholders in both languages", () => {
		const slots = (v: unknown) => (typeof v === "string" ? (v.match(/\{\w+\}/g) ?? []).sort() : []);
		for (const [k, v] of enLeaves) expect(slots(frLeaves.get(k)), k).toEqual(slots(v));
	});
});
