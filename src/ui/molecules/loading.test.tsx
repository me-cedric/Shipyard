import { act, fireEvent, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { DURATION } from "../motion";
import { renderApp } from "../test-utils";
import { Loading } from "./loading";
import { PageHeader } from "./page-header";

// spec:ux-declutter#REQ-024
function Page({ before, after }: { before: ReactNode; after: ReactNode }) {
	const [done, setDone] = useState(false);
	return (
		<div data-testid="page">
			<button type="button" onClick={() => setDone(true)}>
				Load
			</button>
			{done ? after : before}
		</div>
	);
}

const loaded = (title: string) => (
	<>
		<PageHeader title={title} />
		<p>Body</p>
	</>
);

/** Click Load, then let the microtask of the unmount run. */
async function load() {
	fireEvent.click(screen.getByText("Load"));
	await act(async () => {});
}

describe("Loading", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("keeps the title while it loads", () => {
		renderApp(<Page before={<Loading title="Runs" />} after={loaded("Runs")} />);
		expect(screen.getByRole("heading", { name: "Runs" })).toBeInTheDocument();
	});

	it("marks the parent when the same page loads, then clears the mark", async () => {
		renderApp(<Page before={<Loading title="Runs" />} after={loaded("Runs")} />);
		await load();
		expect(screen.getByTestId("page")).toHaveAttribute("data-reveal");
		expect(screen.getByRole("heading", { name: "Runs" }).parentElement).toHaveAttribute(
			"data-page-header",
		);
		act(() => {
			vi.advanceTimersByTime(DURATION.fast + 50);
		});
		expect(screen.getByTestId("page")).not.toHaveAttribute("data-reveal");
	});

	it("does not mark a swap to a page with another title", async () => {
		renderApp(<Page before={<Loading title="Runs" />} after={loaded("Board")} />);
		await load();
		expect(screen.getByTestId("page")).not.toHaveAttribute("data-reveal");
	});

	it("does not mark a swap from one Loading to another with the same title", async () => {
		// The keys make the first Loading unmount: without them React keeps the component.
		renderApp(
			<Page before={<Loading key="a" title="Runs" />} after={<Loading key="b" title="Runs" />} />,
		);
		await load();
		expect(screen.getByTestId("page")).not.toHaveAttribute("data-reveal");
	});

	it("does not mark a Loading with no title", async () => {
		renderApp(<Page before={<Loading />} after={<p>Body</p>} />);
		await load();
		expect(screen.getByTestId("page")).not.toHaveAttribute("data-reveal");
	});

	it("does not mark under the reduced motion preference", async () => {
		// The prefs provider owns `data-motion`, so the test sets the OS preference.
		vi.stubGlobal("matchMedia", () => ({ matches: true }));
		renderApp(<Page before={<Loading title="Runs" />} after={loaded("Runs")} />);
		await load();
		expect(screen.getByTestId("page")).not.toHaveAttribute("data-reveal");
	});

	it("does not mark a page that left the document before the microtask", async () => {
		const { unmount } = renderApp(
			<Page before={<Loading title="Runs" />} after={loaded("Runs")} />,
		);
		const node = screen.getByTestId("page");
		fireEvent.click(screen.getByText("Load"));
		unmount();
		await act(async () => {});
		expect(node).not.toHaveAttribute("data-reveal");
	});
});
