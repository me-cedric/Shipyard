import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Setup / This project / Details", () => {
	beforeEach(async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	});

	it("shows the three connection cards, the project card and the cards of the right column", async () => {
		mountApp("/setup/project");
		for (const name of ["Issue tracker", "Code host", "Figma"])
			expect(await screen.findByRole("region", { name })).toBeInTheDocument();
		// A connection that must be made has a link to make it.
		const tracker = within(screen.getByRole("region", { name: "Issue tracker" }));
		expect(tracker.getByText("Not connected")).toBeInTheDocument();
		expect(tracker.getByRole("link", { name: "Connect" })).toHaveAttribute(
			"href",
			"/setup/project?page=connections",
		);
		const project = within(screen.getByRole("region", { name: "Project" }));
		for (const label of ["Name", "Folder", "Specs and docs folders", "Screens folder"])
			expect(project.getByText(label)).toBeInTheDocument();
		for (const name of ["What agents may do alone", "Automation", "Tickets", "More"])
			expect(screen.getByRole("region", { name })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Health of this project" })).toBeInTheDocument();
	});

	it("points Connect at the choice behind More when an account exists", async () => {
		await unwrap(
			commands.connectionsAdd({
				name: "Acme",
				group: "tracker",
				kind: "linear",
				url: "",
				user: null,
			}),
		);
		// An account that the project does not use yet.
		const settings = await unwrap(commands.projectSettings());
		if (!settings?.file) throw new Error("no project file");
		await unwrap(
			commands.projectFileSave({ ...settings.file, connections: { tracker: null, forge: null } }),
		);
		mountApp("/setup/project");
		const tracker = within(await screen.findByRole("region", { name: "Issue tracker" }));
		await waitFor(() =>
			expect(tracker.getByRole("link", { name: "Connect" })).toHaveAttribute(
				"href",
				"/setup/project#more-issue-tracker",
			),
		);
		// The code host has no account: it still goes to the accounts page.
		const host = within(screen.getByRole("region", { name: "Code host" }));
		expect(host.getByRole("link", { name: "Connect" })).toHaveAttribute(
			"href",
			"/setup/project?page=connections",
		);
	});

	it("moves the pills: Automation and Extensions are pages, the old Connections page stays", async () => {
		mountApp("/setup/project");
		const pills = within(await screen.findByRole("navigation", { name: "This project" }));
		for (const name of ["Details", "Agents may do alone", "Automation", "Extensions"])
			expect(pills.getByRole("link", { name })).toBeInTheDocument();
	});

	it("saves a choice of what agents may do alone at once", async () => {
		const user = userEvent.setup();
		mountApp("/setup/project");
		const alone = within(await screen.findByRole("region", { name: "What agents may do alone" }));
		// The first row is the push of the branch.
		const [push] = alone.getAllByRole("button", { name: "Asks first" });
		await user.click(push as HTMLElement);
		await waitFor(() => expect(mockState().sync.automation.writes.push).toBe(false));
	});

	it("keeps the personas, the profiles, the overrides and the import behind More", async () => {
		mountApp("/setup/project");
		const more = within(await screen.findByRole("region", { name: "More" }));
		for (const label of ["Personas", "Profiles", "Overrides for this project", "Import a project"])
			expect(more.getAllByText(label).length).toBeGreaterThan(0);
		expect(await screen.findByRole("region", { name: "Personas" })).toBeInTheDocument();
	});
});
