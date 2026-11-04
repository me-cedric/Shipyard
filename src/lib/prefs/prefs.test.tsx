import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { usePanelSize } from "./panel-size";
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

function Size() {
	const { size, set, reset } = usePanelSize("terminal", 288);
	return (
		<>
			<output>{size}</output>
			<button type="button" onClick={() => set(400, false)}>
				drag
			</button>
			<button type="button" onClick={() => set(400, true)}>
				drop
			</button>
			<button type="button" onClick={reset}>
				reset
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

	it("keeps a panel size per person, shows a drag at once and resets it", async () => {
		render(
			<QueryClientProvider client={new QueryClient()}>
				<PrefsProvider>
					<Size />
				</PrefsProvider>
			</QueryClientProvider>,
		);
		await screen.findByText("288");
		act(() => screen.getByRole("button", { name: "drag" }).click());
		expect(screen.getByText("400")).toBeInTheDocument();
		expect(mockState().prefs.panelSizes).toEqual({});
		act(() => screen.getByRole("button", { name: "drop" }).click());
		await waitFor(() => expect(mockState().prefs.panelSizes).toEqual({ terminal: 400 }));
		act(() => screen.getByRole("button", { name: "reset" }).click());
		await screen.findByText("288");
		await waitFor(() => expect(mockState().prefs.panelSizes).toEqual({}));
	});
});
