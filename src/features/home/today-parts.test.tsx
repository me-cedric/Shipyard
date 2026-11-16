import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { routers } from "@/test/routers";
import { importAll, withTracker } from "@/test/tracker";
import { SinceAway } from "./away";
import { MyWork } from "./my-work";
import { RolePanels } from "./role-panels";
import { TimeReminder } from "./time-reminder";

/** One component alone, inside the providers and a router for its links. */
function mount(ui: ReactNode) {
	const router = createRouter({
		routeTree: createRootRoute({ component: () => <ShellProvider>{ui}</ShellProvider> }),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	routers().push(router);
	// `never`: a test router has its own tree, not the app tree.
	render(
		<Providers>
			<RouterProvider router={router as never} />
		</Providers>,
	);
}

afterEach(() => vi.useRealTimers());

describe("Today parts (spec:app-redesign#REQ-009)", () => {
	it("a tech lead with no time logged today sees the tech lead panels, the person's work and the reminder to log time", async () => {
		await withTracker();
		await importAll();
		mockState().person = {
			member: "eve",
			found: "email",
			role: "techlead",
			admin: false,
			readOnly: false,
			rights: ["work.edit"],
		};
		const me = (await unwrap(commands.workContext(0))).me;
		const mine = (await unwrap(commands.syncItems({}))).filter((i) => i.member === me);
		expect(mine.length).toBeGreaterThan(0);
		// A workday with no time logged.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(2026, 9, 29, 10));
		mount(
			<>
				<RolePanels />
				<MyWork />
				<TimeReminder />
			</>,
		);
		expect(
			await screen.findByRole("heading", { name: "No time logged today" }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Log time" })).toHaveAttribute("href", "/plan/time");
		expect(screen.getByRole("combobox", { name: "Pick a role" })).toHaveTextContent("Tech lead");
		expect((await screen.findAllByRole("link", { name: /^Open / })).length).toBeGreaterThan(0);
		expect(screen.queryByRole("region", { name: "My pull requests" })).toBeNull();
		expect(await screen.findByRole("heading", { name: /^My items/ })).toBeInTheDocument();
	});

	it("TimeReminder shows nothing on the weekend", async () => {
		await withTracker();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(2026, 9, 31, 10));
		mount(<TimeReminder />);
		await waitFor(() => expect(screen.queryByText("No time logged today")).toBeNull());
	});

	it("SinceAway lists my news with one link to all news", async () => {
		await withTracker();
		await importAll();
		mockState().prefs.todaySeen = 1;
		mount(<SinceAway />);
		const panel = within(await screen.findByRole("region", { name: /^Since you were away/ }));
		expect(panel.getByRole("link", { name: "All news" })).toBeInTheDocument();
	});
});
