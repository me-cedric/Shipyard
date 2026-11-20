import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { askForm } from "@/lib/shell";
import { mountApp } from "@/test/mount";
import { oldPageAnchor, setupAddress } from "./setup-address";

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const seed = () =>
	unwrap(
		commands.connectionsAdd({
			name: "Acme",
			group: "tracker",
			kind: "linear",
			url: "",
			user: null,
		}),
	);
const main = () => screen.findByRole("main");
/** The open project gives the person the level `none` in the settings area. */
async function noSettings() {
	await open();
	const view = await unwrap(commands.rightsGet());
	mockState().person = {
		member: "bo",
		found: "email",
		role: "developer",
		admin: false,
		readOnly: false,
		rights: [],
		access: { ...view.person.access, settings: "none" },
	};
}

describe("Setup scopes (spec:app-redesign#REQ-024)", () => {
	it("keeps the issue tracker and the code host under This project only", async () => {
		await open();
		await seed();
		const router = mountApp("/setup/project");
		expect(await screen.findByRole("combobox", { name: "Issue tracker" })).toBeInTheDocument();
		router.history.push("/setup/project?page=connections");
		expect(await screen.findByRole("heading", { name: "Issue trackers (1)" })).toBeInTheDocument();
		// What this computer holds is not here.
		expect(screen.queryByRole("heading", { name: /^AI tools/ })).not.toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: /^MCP servers/ })).not.toBeInTheDocument();
	});

	it("shows the AI tools, the MCP servers and the permissions under This computer, and no issue tracker", async () => {
		await seed();
		const router = mountApp("/setup/computer");
		expect(await screen.findByRole("heading", { name: /^AI tools/ })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: /^MCP servers/ })).toBeInTheDocument();
		router.history.push("/setup/computer?page=logs");
		expect(
			await screen.findByRole("region", { name: "What the system allows" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: /^Issue trackers/ })).not.toBeInTheDocument();
		expect(screen.queryByRole("group", { name: "Acme" })).not.toBeInTheDocument();
	});

	it("adds only an issue tracker or a code host under This project, and only a provider or a server under This computer", async () => {
		const user = userEvent.setup();
		const types = async () => {
			await user.click(await screen.findByRole("combobox", { name: "Type" }));
			return (await screen.findAllByRole("option")).map((o) => o.textContent);
		};
		const project = mountApp("/setup/project?page=connections");
		await user.click(await within(await main()).findByRole("button", { name: "Connection" }));
		expect(await types()).toEqual(["Issue tracker", "Code host"]);
		await user.keyboard("{Escape}");
		project.history.push("/setup/computer");
		expect(
			await within(await main()).findByRole("button", { name: "Add a provider" }),
		).toBeInTheDocument();
		expect(within(await main()).getByRole("button", { name: "Add a server" })).toBeInTheDocument();
		expect(
			within(await main()).queryByRole("button", { name: "Connection" }),
		).not.toBeInTheDocument();
	});

	it("sends a link that asks for the connection form from This computer to This project", async () => {
		askForm("connection:forge");
		const router = mountApp("/setup/computer");
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project?page=connections"));
		expect(await screen.findByRole("combobox", { name: "Type" })).toHaveTextContent("Code host");
	});

	it("opens a page from its pill or its row and comes back with the back link", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/setup/project");
		// The title stays Setup, and the pills of the scope are links.
		expect(await screen.findByRole("heading", { level: 1, name: "Setup" })).toBeInTheDocument();
		const pills = await screen.findByRole("navigation", { name: "This project" });
		expect(
			within(pills)
				.getAllByRole("link")
				.map((a) => a.textContent?.trim()),
		).toEqual(["Details", "Agents may do alone", "Automation", "Extensions"]);
		expect(within(pills).getByRole("link", { name: "Details" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		// A page with no pill has a row. The row of the tickets waits for the project file.
		await user.click(await screen.findByRole("link", { name: "Health of this project" }));
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project?page=health"));
		expect(
			await screen.findByRole("region", { name: "Broken links between specs and docs" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("navigation", { name: "This project" })).not.toBeInTheDocument();
		await user.click(screen.getByRole("link", { name: "Details" }));
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project"));
		expect(await screen.findByRole("region", { name: "Project" })).toBeInTheDocument();
		await user.click(
			within(await screen.findByRole("navigation", { name: "This project" })).getByRole("link", {
				name: "Extensions",
			}),
		);
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project?page=extensions"));
		await waitFor(() =>
			expect(
				within(screen.getByRole("navigation", { name: "This project" })).getByRole("link", {
					name: "Extensions",
				}),
			).toHaveAttribute("aria-current", "page"),
		);
	});

	it("opens the first page for its own id, and keeps an unknown id in the address", async () => {
		await open();
		const router = mountApp("/setup/project?page=details#pickup-label");
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project#pickup-label"));
		router.history.push("/setup/computer?page=connections");
		await waitFor(() => expect(router.state.location.href).toBe("/setup/computer"));
		// A page can register when its data loads: the scope does not send its id away.
		router.history.push("/setup/me?page=none");
		expect(await screen.findByRole("group", { name: "Theme" })).toBeInTheDocument();
		expect(router.state.location.href).toBe("/setup/me?page=none");
	});

	it("splits the health: the findings of the project, the tools of the computer, the logs apart", async () => {
		await open();
		const router = mountApp("/setup/project?page=health");
		expect(
			await screen.findByRole("region", { name: "Broken links between specs and docs" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "Findings over time" })).not.toBeInTheDocument();
		router.history.push("/setup/computer?page=health");
		expect(await screen.findByRole("heading", { level: 1, name: "1 problem" })).toBeInTheDocument();
		expect(
			screen.queryByRole("region", { name: "Broken links between specs and docs" }),
		).not.toBeInTheDocument();
		router.history.push("/setup/computer?page=logs");
		expect(await screen.findByRole("region", { name: "Findings over time" })).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: "1 problem" })).not.toBeInTheDocument();
	});

	it("keeps the person under Me, with the look and the fonts behind one door", async () => {
		const user = userEvent.setup();
		mountApp("/setup/me");
		expect(await screen.findByRole("group", { name: "Theme" })).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Role" })).toBeInTheDocument();
		expect(screen.getByRole("region", { name: /^Notifications/ })).toBeInTheDocument();
		// The permissions are of this computer, and the start list is on Start.
		expect(screen.queryByRole("region", { name: /^Permissions/ })).not.toBeInTheDocument();
		expect(screen.queryByRole("combobox", { name: "Interface font" })).not.toBeInTheDocument();
		await user.click(screen.getByRole("link", { name: "Look and layout" }));
		expect(await screen.findByRole("combobox", { name: "Interface font" })).toBeInTheDocument();
		expect(screen.queryByRole("combobox", { name: "Role" })).not.toBeInTheDocument();
	});

	it("keeps the permissions and the tour under Me for a role that does not see This computer", async () => {
		await noSettings();
		const router = mountApp("/setup/me#section-permissions");
		expect(
			await screen.findByRole("region", { name: "What the system allows" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: en.onboarding.replay })).toBeInTheDocument();
		expect(router.state.location.pathname).toBe("/setup/me");
	});

	it("sends a link to the permissions under Me to This computer for a role that sees it", async () => {
		const router = mountApp("/setup/me#permission-notifications");
		await waitFor(() =>
			expect(router.state.location.href).toBe("/setup/computer?page=logs#permission-notifications"),
		);
		expect(
			await screen.findByRole("region", { name: "What the system allows" }),
		).toBeInTheDocument();
	});

	it("keeps the cards of each scope, and no count on This computer", async () => {
		await open();
		await seed();
		const router = mountApp("/setup/computer");
		for (const name of [en.personal.setup.security, en.connections.group.mcp])
			expect(await screen.findByRole("region", { name })).toBeInTheDocument();
		const title = screen.getByRole("heading", { level: 1, name: "Setup" });
		// The design shows the title alone: no count next to it.
		expect(title.nextElementSibling?.textContent ?? "").not.toMatch(/^\d+$/);
		router.history.push("/setup/project");
		expect(await screen.findByRole("region", { name: "Project" })).toBeInTheDocument();
		router.history.push("/setup/project?page=connections");
		const accounts = await screen.findByRole("heading", { level: 1, name: "Connections" });
		expect(accounts.nextElementSibling).toHaveTextContent("1");
		expect(await screen.findByRole("heading", { name: /^Issue trackers/ })).toBeInTheDocument();
		router.history.push("/setup/me");
		expect(await screen.findByRole("region", { name: en.notifications.title })).toBeInTheDocument();
	});
});

describe("Setup, look pass 2: rows of the design, the other controls under More", () => {
	it("has the pills on Logs and feedback, with Health as the open one", async () => {
		mountApp("/setup/computer?page=logs");
		const nav = await screen.findByRole("navigation", { name: en.settings.scope.computer });
		expect(within(nav).getByRole("link", { name: en.settings.pills.health })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	it("keeps the advanced controls of This computer in the More card, not in the cards of the design", async () => {
		mountApp("/setup/computer");
		const more = await screen.findByRole("region", { name: en.ui.more });
		expect(within(more).getByText(en.connections.advanced)).toBeInTheDocument();
		expect(
			within(more).getByRole("button", { name: en.connections.runner.detect }),
		).toBeInTheDocument();
		const tools = await screen.findByRole("region", { name: en.connections.group.runner });
		expect(within(tools).queryByText(en.connections.advanced)).toBeNull();
	});

	it("keeps the theme files, the language files and each notification in the More card of Me", async () => {
		mountApp("/setup/me");
		const more = await screen.findByRole("region", { name: en.ui.more });
		for (const label of [
			en.extras.look.themeFiles,
			en.prefs.languageFiles,
			en.personal.setup.eachNotification,
		])
			expect(within(more).getByText(label)).toBeInTheDocument();
		const theme = screen.getByRole("region", { name: en.prefs.theme });
		expect(within(theme).queryByText(en.extras.look.themeFiles)).toBeNull();
	});
});

describe("setupAddress", () => {
	it.each([
		["project", "", "/setup/project"],
		["project", "#issue-tracker", "/setup/project#issue-tracker"],
		["project", "#pickup-label", "/setup/project?page=automation#pickup-label"],
		["project", "#section-tickets", "/setup/project?page=tickets#section-tickets"],
		["connections", "", "/setup/computer"],
		["connections", "#connections", "/setup/project?page=connections#connections"],
		["connections", "#connections-runner", "/setup/computer#connections-runner"],
		["connections", "#connections-outside", "/setup/computer?page=share#connections-outside"],
		["agents-rules", "#tiers", "/setup/computer?page=models#tiers"],
		["extensions", "", "/setup/project?page=extensions"],
		["me", "#section-agent", "/setup/me#section-agent"],
		["me", "#section-setup", "/setup/start#section-setup"],
		// Me sends these to This computer for a role that sees it.
		["me", "#section-permissions", "/setup/me#section-permissions"],
		["me", "#permission-notifications", "/setup/me#permission-notifications"],
		["me", "#tour", "/setup/me#tour"],
		["me", "#ui-font", "/setup/me?page=look#ui-font"],
		["health", "", "/setup/project?page=health"],
		["health", "#tools", "/setup/computer?page=health#tools"],
		["health", "#doctor-console", "/setup/computer?page=logs#doctor-console"],
		["team", "", undefined],
	])("%s%s opens %s", (tab, hash, to) => {
		expect(setupAddress(tab, hash)).toBe(to);
	});

	it("names the card of the first page for a page id of before", () => {
		expect(oldPageAnchor("project", "connections")).toBe("connections");
		expect(oldPageAnchor("project", "tickets")).toBeUndefined();
		expect(oldPageAnchor("computer", "connections")).toBeUndefined();
	});
});
