import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { routers } from "@/test/routers";
import { importAll, withTracker } from "@/test/tracker";
import { SinceAway } from "./away";
import { RolePanelsPage } from "./role-panels";
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
		mount(<RolePanelsPage />);
		expect(
			await screen.findByRole("heading", { name: "No time logged today" }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Log your time" })).toHaveAttribute(
			"href",
			"/plan/time",
		);
		expect(
			within(screen.getByRole("group", { name: "Pick a role" })).getByRole("button", {
				name: "Tech lead",
			}),
		).toHaveAttribute("aria-pressed", "true");
		expect((await screen.findAllByRole("link", { name: /^Open / })).length).toBeGreaterThan(0);
		expect(await screen.findByRole("region", { name: "Failing checks" })).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "My pull requests" })).toBeNull();
		expect(await screen.findByRole("heading", { name: "My work" })).toBeInTheDocument();
	});

	it("Today shows the time reminder as a slim card with Log", async () => {
		await withTracker();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(2026, 9, 29, 10));
		mount(<TimeReminder />);
		expect(await screen.findByText("Log your time for today")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Log your time" })).toHaveAttribute(
			"href",
			"/plan/time",
		);
	});

	it("TimeReminder shows nothing on the weekend", async () => {
		await withTracker();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(2026, 9, 31, 10));
		mount(
			<>
				<TimeReminder />
				<TimeReminder alert />
			</>,
		);
		await waitFor(() => expect(screen.queryByText("No time logged today")).toBeNull());
		expect(screen.queryByText("Log your time for today")).toBeNull();
	});

	it("SinceAway lists my news with one link to all news", async () => {
		await withTracker();
		await importAll();
		mockState().prefs.todaySeen = 1;
		mount(<SinceAway />);
		const panel = within(await screen.findByRole("region", { name: /^Since you were away/ }));
		expect(panel.getByRole("link", { name: "All news" })).toBeInTheDocument();
		// Three rows show first; "N more" shows the rest in place.
		const rows = () => panel.getAllByRole("listitem");
		expect(rows()).toHaveLength(3);
		await userEvent.setup().click(panel.getByRole("button", { name: /^\d+ more$/ }));
		expect(rows().length).toBeGreaterThan(3);
	});
});
