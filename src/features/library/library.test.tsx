import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PLACES } from "@/features/shell/places";
import { type SectionSpace, tabLabel } from "@/features/shell/spaces";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const DOORS = Object.values(en.library.doors);

async function mount(path: string) {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return mountApp(path);
}

const door = (name: string) => screen.findByRole("region", { name });
const hrefs = (el: HTMLElement) =>
	within(el)
		.getAllByRole("link")
		.map((a) => a.getAttribute("href"));

/** The person of the mock with the level `none` in some areas. */
async function hide(...areas: string[]) {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const view = await unwrap(commands.rightsGet());
	mockState().person = {
		member: "bo",
		found: "email",
		role: "developer",
		admin: false,
		readOnly: false,
		rights: [],
		access: { ...view.person.access, ...Object.fromEntries(areas.map((a) => [a, "none"])) },
	};
}

// spec:app-redesign#REQ-020
describe("Library doors", () => {
	it("opens /library on the home, with the four doors and no section switch", async () => {
		const router = await mount("/library");
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/home"));
		for (const name of DOORS) expect(await door(name)).toBeVisible();
		expect(screen.getByRole("heading", { level: 1, name: en.library.title })).toBeVisible();
		expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
		expect(within(screen.getByRole("main")).queryByRole("link", { name: "Library" })).toBeNull();
		const nav = await screen.findByRole("navigation", { name: "Sidebar" });
		expect(within(nav).getByRole("link", { current: "page" })).toHaveAccessibleName("Library");
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows that one decision waits in the door Why it is so", async () => {
		const router = await mount("/library/home");
		const list = await unwrap(commands.designList());
		expect(list.adrs.filter((a) => a.status === "proposed")).toHaveLength(1);
		const chip = await within(await door(en.library.doors.why)).findByRole("link", {
			name: "1 decision waits",
		});
		expect(chip).toHaveAttribute("href", "/library/decisions");
		expect(chip).toHaveClass("min-h-control");
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("names the count of the open questions in the door What it must do", async () => {
		const router = await mount("/library/home");
		const all = await unwrap(commands.specsQuestions());
		const open = all.filter((e) => e.question.status === "open").length;
		expect(open).toBeGreaterThan(0);
		const name = open === 1 ? "1 open question" : `${open} open questions`;
		const chip = await within(await door(en.library.doors.what)).findByRole("link", { name });
		expect(chip).toHaveAttribute("href", "/library/questions");
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("gives each page of Library one chip link, in one door", async () => {
		const router = await mount("/library/home");
		const doors = await Promise.all(DOORS.map(door));
		const views = PLACES.library
			.map((v) => v.split("/") as [SectionSpace, string])
			.filter(([, slug]) => slug !== "home");
		expect(views).toHaveLength(19);
		for (const [space, slug] of views) {
			const holds = doors.filter((d) => hrefs(d).includes(`/library/${slug}`));
			// Questions has two chips: the open ones in What it must do, the answers in Why it is so.
			expect(holds, slug).toHaveLength(slug === "questions" ? 2 : 1);
			if (slug === "questions") continue;
			// The chip has the name of its page. The Manual is a chip too: no page is off the doors.
			const names = within(holds[0] as HTMLElement)
				.getAllByRole("link")
				.filter((a) => a.getAttribute("href") === `/library/${slug}`)
				.map((a) => a.textContent);
			expect(
				names.some((n) => n?.startsWith(tabLabel(en, space, slug))),
				slug,
			).toBe(true);
		}
		const how = within(await door(en.library.doors.how));
		expect(how.getByRole("link", { name: en.tabs.knowledge.graph })).toBeVisible();
		expect(how.getByRole("link", { name: en.tabs.design.flows })).toBeVisible();
		const learn = within(await door(en.library.doors.learn));
		expect(learn.getByRole("link", { name: en.library.views.reports })).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("gives no chip to a page that the role does not see, and hides a door with no chip", async () => {
		await hide("design", "specs");
		const router = mountApp("/library/home");
		// How it is built keeps the Map: it is a page of the knowledge area.
		const how = await door(en.library.doors.how);
		await waitFor(() => expect(hrefs(how)).toEqual(["/library/graph"]));
		expect(screen.queryByRole("region", { name: en.library.doors.why })).toBeNull();
		expect(screen.queryByRole("region", { name: en.library.doors.what })).toBeNull();
		// Reports stays: the role still sees a page that holds an export.
		expect(hrefs(await door(en.library.doors.learn))).toContain("/library/reports");
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	// spec:app-redesign#REQ-006
	it("hides the Reports chip when no report is left, and keeps the home while Reports shows", async () => {
		await hide("knowledge", "code", "work", "design", "specs");
		const hidden = mountApp("/library/reports");
		expect(await screen.findByText(en.rights.noAccess)).toBeVisible();
		const nav = await screen.findByRole("navigation", { name: "Sidebar" });
		expect(within(nav).queryByRole("link", { name: "Library" })).toBeNull();
		await waitFor(() => expect(hidden.state.status).toBe("idle"));
	});

	it("keeps the home with the Reports chip for a role with no Library view", async () => {
		await hide("knowledge", "design", "specs");
		const router = mountApp("/library");
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/home"));
		await waitFor(async () =>
			expect(hrefs(await door(en.library.doors.learn))).toEqual(["/library/reports"]),
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it.each(["architect", "qa", "designer"] as const)(
		"opens /library on the doors for the role %s",
		async (role) => {
			await hide();
			const person = mockState().person;
			if (person) person.role = role;
			const router = mountApp("/library");
			await waitFor(() => expect(router.state.location.pathname).toBe("/library/home"));
			await waitFor(() => expect(router.state.status).toBe("idle"));
		},
	);

	it("orders the chips as the design, with one chip for the open questions", async () => {
		const router = await mount("/library/home");
		const names = async (d: string) =>
			within(await door(d))
				.getAllByRole("link")
				.map((a) => a.textContent);
		await waitFor(async () =>
			expect(await names(en.library.doors.what)).toEqual([
				"Specs",
				"Test plans",
				"What is tested",
				expect.stringMatching(/open question/),
			]),
		);
		const what = within(await door(en.library.doors.what));
		expect(what.queryByRole("link", { name: "Questions" })).toBeNull();
		expect(what.getByRole("link", { name: "What is tested" })).toHaveAttribute(
			"href",
			"/library/test-plans/coverage",
		);
		await waitFor(async () =>
			expect(await names(en.library.doors.why)).toEqual([
				"1 decision waits",
				"Decisions",
				"Answers",
				"Project rules",
			]),
		);
		expect(
			within(await door(en.library.doors.why)).getByRole("link", { name: "Answers" }),
		).toHaveAttribute("href", "/library/questions");
		const learn = within(await door(en.library.doors.learn));
		expect(learn.getByRole("link", { name: "Glossary" })).toHaveAttribute("href", "/library/learn");
		const path = (await unwrap(commands.learnGet())).path;
		expect(path.length).toBeGreaterThan(0);
		expect(await learn.findByRole("link", { name: `Learn, 0 of ${path.length}` })).toHaveAttribute(
			"href",
			"/library/learn",
		);
		expect(screen.getByRole("heading", { level: 2, name: en.library.doors.what })).toHaveClass(
			"text-30",
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("lists the pages opened last, and pins and unpins one", async () => {
		const user = userEvent.setup();
		const router = await mount("/library/handbook");
		// The link above the page gives way to the one in the page header: wait for the page first.
		await screen.findByRole("heading", { level: 1, name: "Handbook" });
		await user.click(
			await within(await screen.findByRole("main")).findByRole("link", { name: en.library.back }),
		);
		const last = await screen.findByRole("region", { name: "Opened last" });
		expect(within(last).getByRole("link", { name: "Handbook" })).toHaveAttribute(
			"href",
			"/library/handbook",
		);
		expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull();
		await user.click(within(last).getByRole("button", { name: "Pin Handbook" }));
		const pinned = await screen.findByRole("region", { name: "Pinned" });
		expect(within(pinned).getByRole("link", { name: "Handbook" })).toBeVisible();
		const unpin = within(pinned).getByRole("button", { name: "Unpin Handbook" });
		expect(unpin).toHaveClass("min-h-control");
		await user.click(unpin);
		await waitFor(() => expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull());
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows the back link and no section switch on a page of Library", async () => {
		const router = await mount("/library/handbook");
		await screen.findByRole("heading", { level: 1, name: "Handbook" });
		const back = await within(await screen.findByRole("main")).findByRole("link", {
			name: en.library.back,
		});
		expect(back).toHaveAttribute("href", "/library/home");
		expect(back).toHaveClass("min-h-control");
		expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
		await userEvent.click(back);
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/home"));
		expect(await door(en.library.doors.what)).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it.each([
		["/design/diagrams", "/library/diagrams"],
		["/specs/questions", "/library/questions"],
		["/knowledge/handbook", "/library/handbook"],
	])("still opens the old address %s on %s", async (from, to) => {
		const router = await mount(from);
		await waitFor(() => expect(router.state.location.pathname).toBe(to));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
