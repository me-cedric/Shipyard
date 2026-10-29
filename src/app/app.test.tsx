import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SPACE_IDS, SPACES, tabLabel } from "@/features/shell";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

function mount(path: string, role?: string) {
	if (role) mockState().prefs.role = role as "pm";
	return mountApp(path);
}

const sidebar = () => screen.findByRole("navigation", { name: "Sidebar" });
const current = (nav: HTMLElement) =>
	within(nav)
		.getAllByRole("link")
		.find((l) => l.getAttribute("aria-current") === "page");

describe("router", () => {
	it.each(SPACE_IDS)("renders %s with its tabs and opens the first one", async (space) => {
		mount(`/${space}`);
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		const links = within(tabs).getAllByRole("link");
		expect(links.map((l) => l.textContent)).toEqual(
			SPACES[space].map((tab) => tabLabel(en, space, tab)),
		);
		expect(links[0]).toHaveAttribute("aria-current", "page");
		expect(current(await sidebar())).toHaveAccessibleName(en.space[space]);
	});

	it("has a label in each language for each tab", () => {
		for (const space of SPACE_IDS)
			for (const tab of SPACES[space]) {
				expect(tabLabel(en, space, tab)).not.toBe("");
				expect(tabLabel(fr, space, tab)).not.toBe("");
			}
	});

	it("shows the first run on Home until a project is active", async () => {
		mount("/home/inbox");
		expect(await screen.findByRole("button", { name: "Open a local folder" })).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: "Needs you" })).toBeNull();
	});

	it("shows the heading of the Inbox", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mount("/home/inbox");
		expect(await screen.findByRole("heading", { name: "Needs you" })).toBeInTheDocument();
	});

	it.each([
		["none", "Home"],
		["pm", "Work"],
		["developer", "Factory"],
	])("sends / to the home of role %s", async (role, name) => {
		mount("/", role);
		expect(current(await sidebar())).toHaveAccessibleName(name);
	});

	it("opens Knowledge for junior and keeps all 8 entries", async () => {
		mount("/", "junior");
		const nav = await sidebar();
		expect(
			await within(nav).findByRole("link", { name: "Knowledge", current: "page" }),
		).toBeTruthy();
		const links = within(nav).getAllByRole("link");
		const names = ["Home", "Knowledge", "Design", "Specs", "Work", "Factory", "Code", "Settings"];
		expect(links).toHaveLength(names.length);
		for (const [i, name] of names.entries()) expect(links[i]).toHaveAccessibleName(name);
	});

	it("shows the not-found view for an unknown path", async () => {
		mount("/nope");
		expect(await screen.findByRole("heading", { name: "Not found" })).toBeInTheDocument();
	});
});

describe("shell", () => {
	it("opens the palette with Mod+K and opens a ref in the inspector", async () => {
		const user = userEvent.setup();
		mount("/home");
		await sidebar();
		await user.keyboard("{Control>}k{/Control}");
		await screen.findByRole("dialog");
		const input = screen.getByRole("combobox");
		await user.type(input, "wi:KEY-1");
		await user.click(await screen.findByRole("option", { name: /Open wi:KEY-1/ }));
		expect(await screen.findByRole("button", { name: "wi:KEY-1, Unresolved" })).toBeVisible();
	});

	it("toggles the inspector with Mod+I", async () => {
		const user = userEvent.setup();
		mount("/home");
		await sidebar();
		const inspector = screen.getByLabelText("Inspector", { selector: "aside" });
		expect(inspector).toHaveAttribute("data-open", "false");
		await user.keyboard("{Control>}i{/Control}");
		expect(inspector).toHaveAttribute("data-open", "true");
	});

	it("opens a space with Mod+2", async () => {
		const user = userEvent.setup();
		mount("/home");
		await sidebar();
		await user.keyboard("{Control>}2{/Control}");
		expect(await screen.findByRole("link", { name: "Diagrams", current: "page" })).toBeTruthy();
	});

	it("opens the assistant with Mod+J, focuses its input and keeps the draft in the next view", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mount("/home");
		await sidebar();
		const panel = await screen.findByLabelText("Assistant", { selector: "aside" });
		expect(panel).toHaveAttribute("data-open", "false");
		expect(panel).toHaveAttribute("inert");
		await user.keyboard("{Control>}j{/Control}");
		const input = await screen.findByRole("textbox", { name: "Message" });
		await waitFor(() => expect(input).toHaveFocus());
		await user.type(input, "keep me");
		await user.keyboard("{Control>}2{/Control}");
		await screen.findByRole("link", { name: "Diagrams", current: "page" });
		expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("keep me");
		// The shell button closes it again.
		await user.click(
			within(await screen.findByRole("banner")).getByRole("button", { name: "Assistant" }),
		);
		expect(panel).toHaveAttribute("data-open", "false");
	});

	it("shows sync, search, assistant, bell and theme on top, and only commit in the status bar", async () => {
		mount("/home");
		const top = within((await screen.findByRole("banner")) as HTMLElement);
		for (const name of ["Sync", "Search", "Assistant", "Notifications", /^Theme: /])
			expect(top.getByRole("button", { name })).toBeInTheDocument();
		const bar = (await screen.findByRole("contentinfo")) as HTMLElement;
		expect(
			within(bar)
				.getAllByRole("button")
				.map((b) => b.textContent),
		).toEqual(["Commit"]);
		expect(await within(bar).findByRole("img", { name: "Success" })).toBeInTheDocument();
	});
});
