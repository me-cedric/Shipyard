import { act, render, screen } from "@testing-library/react";
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
	it("switches to French", () => {
		render(
			<I18nProvider>
				<Probe />
			</I18nProvider>,
		);
		expect(screen.getByRole("button")).toHaveTextContent("en:Close");
		act(() => screen.getByRole("button").click());
		expect(screen.getByRole("button")).toHaveTextContent("fr:Fermer");
		expect(document.documentElement.lang).toBe("fr");
		expect(localStorage.getItem("shipyard.lang")).toBe("fr");
	});

	it("interpolates {name}", () => {
		expect(format("{name} ({count})", { name: "Go", count: 2 })).toBe("Go (2)");
	});
});
