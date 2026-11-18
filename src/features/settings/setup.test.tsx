import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { askForm } from "@/lib/shell";
import { mountApp } from "@/test/mount";
import { setupAddress } from "./setup-address";

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
/** A link of the section list of the page that shows now. */
const section = (name: string | RegExp) =>
	waitFor(() =>
		within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name }),
	);
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
		mountApp("/setup/computer");
		expect(await screen.findByRole("heading", { name: /^AI tools/ })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: /^MCP servers/ })).toBeInTheDocument();
		expect(await screen.findByRole("region", { name: /^Permissions/ })).toBeInTheDocument();
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
		await user.click(await within(await main()).findByRole("button", { name: "Connection" }));
		expect(await types()).toEqual(["MCP server", "Model provider"]);
	});

	it("sends a link that asks for the connection form from This computer to This project", async () => {
		askForm("connection:forge");
		const router = mountApp("/setup/computer");
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project?page=connections"));
		expect(await screen.findByRole("combobox", { name: "Type" })).toHaveTextContent("Code host");
	});

	it("opens a sub-page from its door and comes back with the back link", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/setup/project");
		const doors = await screen.findByRole("navigation", { name: "This project" });
		// The door of the tickets waits for the project file.
		await within(doors).findByRole("link", { name: "Tickets" });
		expect(
			within(doors)
				.getAllByRole("link")
				.map((a) => a.textContent?.trim()),
		).toEqual(["Connections", "Tickets", "Extensions", "Health of this project"]);
		await user.click(within(doors).getByRole("link", { name: "Health of this project" }));
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project?page=health"));
		expect(
			await screen.findByRole("heading", { level: 1, name: "Health of this project" }),
		).toBeInTheDocument();
		// The sub-page replaces the scope: one place for each setting.
		expect(screen.queryByRole("combobox", { name: "Issue tracker" })).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "This project" }));
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project"));
		expect(await screen.findByRole("combobox", { name: "Issue tracker" })).toBeInTheDocument();
	});

	it("splits the health: the findings of the project, the tools of the computer, the logs apart", async () => {
		await open();
		const router = mountApp("/setup/project?page=health");
		expect(await screen.findByRole("region", { name: /^Broken refs/ })).toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Findings over time" })).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "Base" })).not.toBeInTheDocument();
		router.history.push("/setup/computer?page=health");
		expect(await screen.findByRole("region", { name: "Base" })).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "Findings over time" })).not.toBeInTheDocument();
		expect(screen.queryByRole("region", { name: /^Broken refs/ })).not.toBeInTheDocument();
		router.history.push("/setup/computer?page=logs");
		expect(await screen.findByRole("region", { name: /^Debug console/ })).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "Base" })).not.toBeInTheDocument();
	});

	it("keeps the person under Me, with the look and the fonts behind one door", async () => {
		const user = userEvent.setup();
		mountApp("/setup/me");
		expect(await screen.findByRole("combobox", { name: "Theme" })).toBeInTheDocument();
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
		expect(await screen.findByRole("region", { name: /^Permissions/ })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: en.onboarding.replay })).toBeInTheDocument();
		expect(await section(/^Permissions/)).toBeInTheDocument();
		expect(router.state.location.pathname).toBe("/setup/me");
	});

	it("sends a link to the permissions under Me to This computer for a role that sees it", async () => {
		const router = mountApp("/setup/me#permission-notifications");
		await waitFor(() =>
			expect(router.state.location.href).toBe("/setup/computer#permission-notifications"),
		);
		expect(await screen.findByRole("region", { name: /^Permissions/ })).toBeInTheDocument();
	});

	it("keeps the section list of each scope, and the count of This computer", async () => {
		await open();
		await seed();
		const router = mountApp("/setup/computer");
		for (const name of [en.settings.certs.title, en.connections.group.mcp, /^Permissions/])
			expect(await section(name)).toBeInTheDocument();
		const title = screen.getByRole("heading", { level: 1, name: "This computer" });
		await waitFor(() => expect(title.nextElementSibling).toHaveTextContent(/^\d+$/));
		router.history.push("/setup/project");
		expect(await section(en.projects.paths)).toBeInTheDocument();
		router.history.push("/setup/project?page=connections");
		const accounts = await screen.findByRole("heading", { level: 1, name: "Connections" });
		expect(accounts.nextElementSibling).toHaveTextContent("1");
		expect(await section(en.connections.group.tracker)).toBeInTheDocument();
		router.history.push("/setup/me");
		expect(await section(en.notifications.title)).toBeInTheDocument();
	});
});

describe("setupAddress", () => {
	it.each([
		["project", "", "/setup/project"],
		["project", "#issue-tracker", "/setup/project#issue-tracker"],
		["project", "#pickup-label", "/setup/project#pickup-label"],
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
});
