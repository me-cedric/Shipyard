import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { PrefsProvider, usePrefs } from "./prefs";

function Probe() {
	const { setPrefs, theme, overridden, loaded } = usePrefs();
	return (
		<>
			<output>{loaded ? `${theme}:${overridden.join(",")}` : "loading"}</output>
			<button type="button" onClick={() => setPrefs({ theme: "dark", density: "compact" })}>
				set
			</button>
		</>
	);
}

const mount = () =>
	render(
		<QueryClientProvider
			client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
		>
			<PrefsProvider>
				<Probe />
			</PrefsProvider>
		</QueryClientProvider>,
	);

describe("prefs", () => {
	it("loads from the app data folder, writes data attributes and saves through the command", async () => {
		mockState().prefs.density = "compact";
		mount();
		await screen.findByText("system:");
		expect(document.documentElement.dataset.density).toBe("compact");
		act(() => screen.getByRole("button").click());
		expect(document.documentElement.dataset.theme).toBe("dark");
		await waitFor(() => expect(mockState().prefs.theme).toBe("dark"));
		expect(localStorage.getItem("shipyard.prefs")).toBeNull();
	});

	it("applies the overrides of the active project and marks them", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.projectOverridesSave({ theme: "light", accent: "violet" }));
		mount();
		await screen.findByText("light:theme");
		expect(document.documentElement.dataset.accent).toBe("violet");
		expect(document.documentElement.dataset.theme).toBe("light");
	});
});
