import { act, render, screen, waitFor } from "@testing-library/react";
import { mockState } from "@/lib/ipc/mock";
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
