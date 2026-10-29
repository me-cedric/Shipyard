import { act, render } from "@testing-library/react";
import { PrefsProvider, usePrefs } from "./prefs";

function Probe() {
	const { setPrefs } = usePrefs();
	return (
		<button type="button" onClick={() => setPrefs({ theme: "dark", density: "compact" })}>
			set
		</button>
	);
}

describe("prefs", () => {
	it("writes data attributes and storage", () => {
		const { getByRole } = render(
			<PrefsProvider>
				<Probe />
			</PrefsProvider>,
		);
		expect(document.documentElement.dataset.theme).toBe("system");
		act(() => getByRole("button").click());
		expect(document.documentElement.dataset.theme).toBe("dark");
		expect(document.documentElement.dataset.density).toBe("compact");
		expect(localStorage.getItem("shipyard.prefs")).toContain('"dark"');
	});
});
