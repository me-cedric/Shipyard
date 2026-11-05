import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DOC_DIR } from "@/lib/knowledge";
import { ShellProvider } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { renderApp } from "@/ui/test-utils";
import { OpenActions } from "./item-facts";
import { RefDetail } from "./ref-detail";

const detail = (refId: string) =>
	renderApp(
		<ShellProvider>
			<RefDetail refId={refId} onOpen={() => {}} />
		</ShellProvider>,
	);

const Probe = () => <p>{useTabSelection(`knowledge:${DOC_DIR.documents}`)[0]}</p>;

describe("the inspector of an item", () => {
	beforeEach(() => unwrap(commands.projectsOpen("/mock/alpha", false)));

	it("shows a document with its path, preview, outline, last change and backlinks state", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		detail("doc:docs/handbook/architecture/overview.md");
		expect(await screen.findByText("docs/handbook/architecture/overview.md")).toBeInTheDocument();
		expect(await screen.findByText("Architecture overview")).toBeInTheDocument();
		expect(await screen.findByText(/^The model is model:system/)).toBeInTheDocument();
		expect(await screen.findByText("Not committed yet")).toBeInTheDocument();
		expect(screen.getByText("Nothing links here")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Copy path" }));
		expect(writeText).toHaveBeenCalledWith("docs/handbook/architecture/overview.md");
	});

	it("names who changed a file last, and gives a ref with no place the same shape", async () => {
		const { unmount } = detail("doc:src/app.ts");
		expect(await screen.findByText(/^Changed by Ada Lovelace, /)).toBeInTheDocument();
		// Not Markdown: no preview.
		expect(screen.queryByRole("navigation", { name: "Outline" })).toBeNull();
		unmount();
		detail("conn:none");
		expect(await screen.findByText("Nothing links here")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Copy path" })).toBeNull();
	});

	it("offers Edit only for a handbook page: no other page reads the request", async () => {
		const actions = async (refId: string) => {
			const router = createRouter({
				routeTree: createRootRoute({ component: () => <OpenActions refId={refId} /> }),
				history: createMemoryHistory(),
			});
			const { unmount } = renderApp(<RouterProvider router={router} />);
			await screen.findByRole("button", { name: "Open" });
			return unmount;
		};
		let unmount = await actions("doc:docs/handbook/architecture/overview.md");
		expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
		unmount();
		for (const ref of ["doc:docs/documents/brief.md", "doc:docs/slides/kickoff.md"]) {
			unmount = await actions(ref);
			expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
			unmount();
		}
	});

	it("opens a file outside the docs folders in the file viewer, not on a docs page", async () => {
		const router = createRouter({
			routeTree: createRootRoute({ component: () => <OpenActions refId="doc:src/app.ts" /> }),
			history: createMemoryHistory(),
		});
		renderApp(<RouterProvider router={router} />);
		await userEvent.click(await screen.findByRole("button", { name: "Open" }));
		expect(await screen.findByRole("region", { name: "File src/app.ts" })).toBeInTheDocument();
		expect(router.state.location.pathname).toBe("/");
	});

	it("selects a docs-folder file on its page before it opens that page", async () => {
		const path = `${DOC_DIR.documents}/brief.md`;
		const router = createRouter({
			routeTree: createRootRoute({ component: () => <OpenActions refId={`doc:${path}`} /> }),
			history: createMemoryHistory(),
		});
		renderApp(<RouterProvider router={router} />);
		await userEvent.click(await screen.findByRole("button", { name: "Open" }));
		renderApp(<Probe />);
		expect(await screen.findByText(path)).toBeInTheDocument();
	});
});
