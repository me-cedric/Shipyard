import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";
import { joinEntry } from "./team-rights";

const aside = async (name: string) => within(await screen.findByRole("complementary", { name }));

describe("Work / Team", () => {
	it("lists the members in a table with headers and units", async () => {
		await withTracker();
		mountApp("/work/team");
		const ada = await screen.findByRole("row", { name: "ada" });
		expect(
			within(screen.getByRole("table", { name: "Team" }))
				.getAllByRole("columnheader")
				.map((h) => h.textContent),
		).toEqual(["Name", "Role", "Capacity (days a week)", "Day rate", "Skills"]);
		expect(
			within(ada)
				.getAllByRole("cell")
				.map((c) => c.textContent),
		).toEqual([
			expect.stringContaining("Ada Lovelace"),
			"dev",
			"5",
			"520/d",
			expect.stringContaining("api"),
		]);
		expect(screen.getAllByRole("row", { name: /^[a-z]+$/ })).toHaveLength(5);
	});

	it("edits a member and writes the new capacity to the team", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/team");
		await user.click(within(await screen.findByRole("row", { name: "grace" })).getByRole("button"));
		const panel = await aside("Grace Hopper");
		const capacity = panel.getByRole("spinbutton", { name: "Capacity (days a week)" });
		expect(capacity).toHaveValue(4);
		await user.clear(capacity);
		await user.type(capacity, "3");
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().work.team.members.find((m) => m.handle === "grace")?.capacity).toBe(3),
		);
		expect(
			within(await screen.findByRole("row", { name: "grace" })).getAllByRole("cell")[2],
		).toHaveTextContent(/^3$/);
	});

	it("adds a member with one primary action", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/team");
		await user.click(await screen.findByRole("button", { name: "Member" }));
		const panel = await aside("Member");
		await user.type(panel.getByRole("textbox", { name: "Name" }), "Barbara Liskov");
		await user.type(panel.getByRole("textbox", { name: "Handle" }), "barbara");
		await user.click(panel.getByRole("combobox", { name: "Role" }));
		await user.click(await screen.findByRole("option", { name: "Developer" }));
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().work.team.members).toHaveLength(6));
		// A second save replaces the member and adds none.
		await user.click((await aside("Barbara Liskov")).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(screen.getAllByRole("row", { name: /^[a-z]+$/ })).toHaveLength(6));
		expect(mockState().work.team.members).toHaveLength(6);
	});

	it("refuses a duplicate handle, names it and keeps the last valid team", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/team");
		await user.click(within(await screen.findByRole("row", { name: "grace" })).getByRole("button"));
		const panel = await aside("Grace Hopper");
		const handle = panel.getByRole("textbox", { name: "Handle" });
		await user.clear(handle);
		await user.type(handle, "ada");
		await user.click(panel.getByRole("button", { name: "Save" }));
		expect(await panel.findByRole("alert")).toHaveTextContent("`ada` is shared by");
		expect(mockState().work.team.members.map((m) => m.handle)).toEqual([
			"ada",
			"grace",
			"alan",
			"margaret",
			"edsger",
		]);
	});

	it("hides the day rate while the project is sealed and this machine has no passphrase", async () => {
		const user = userEvent.setup();
		await withTracker();
		await unwrap(commands.workSeal("s3cret"));
		await unwrap(commands.workLock());
		mountApp("/work/team");
		const ada = await screen.findByRole("row", { name: "ada" });
		expect(ada).not.toHaveTextContent("520");
		expect(within(ada).getByRole("img", { name: "Passphrase missing" })).toBeInTheDocument();
		const field = screen.getByLabelText("Passphrase");
		// The field never shows what a person types.
		expect(field).toHaveAttribute("type", "password");
		await user.type(field, "wrong");
		await user.click(screen.getByRole("button", { name: "Unlock" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("does not open");
		expect(field).toHaveValue("");
		expect(screen.getByRole("row", { name: "ada" })).not.toHaveTextContent("520");
		await user.type(screen.getByLabelText("Passphrase"), "s3cret");
		await user.click(screen.getByRole("button", { name: "Unlock" }));
		await waitFor(() =>
			expect(screen.getByRole("row", { name: "ada" })).toHaveTextContent("520/d"),
		);
		expect(screen.queryByLabelText("Passphrase")).toBeNull();
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		mountApp("/work/team");
		expect(await screen.findByRole("button", { name: "Membre" })).toBeInTheDocument();
		expect(
			await screen.findByRole("columnheader", { name: "Capacité (jours par semaine)" }),
		).toBeInTheDocument();
	});

	it("shows the rights of each role with icons, and names who the person is", async () => {
		await withTracker();
		mockState().person = {
			member: "ada",
			found: "account",
			role: "techlead",
			admin: true,
			readOnly: false,
			rights: ["project.settings", "work.edit"],
		};
		mountApp("/work/team");
		const matrix = within(await screen.findByRole("table", { name: "Rights of each role" }));
		expect(matrix.getAllByRole("row")).toHaveLength(10);
		expect(
			within(matrix.getByRole("row", { name: /^Viewer/ })).getAllByRole("img", { name: /no$/ }),
		).toHaveLength(10);
		expect(await screen.findByText("You are ada (Account)")).toBeInTheDocument();
	});

	it("turns Member off with the right for a developer", async () => {
		await withTracker();
		mockState().person = {
			member: "ada",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: ["work.edit"],
		};
		mountApp("/work/team");
		const add = await screen.findByRole("button", { name: "Member" });
		await waitFor(() => expect(add).toBeDisabled());
		expect(add).toHaveAccessibleDescription(
			"Needs the right project.settings (your role: Developer)",
		);
	});

	it("saves the e-mails, the role, the admin flag and the right changes of a member", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/team");
		await user.click(within(await screen.findByRole("row", { name: "grace" })).getByRole("button"));
		const panel = await aside("Grace Hopper");
		await user.type(panel.getByRole("textbox", { name: "E-mails" }), "grace@example.com");
		await user.click(panel.getByRole("combobox", { name: "Role" }));
		await user.click(await screen.findByRole("option", { name: "Architect" }));
		expect(panel.getByRole("list", { name: "Rights" })).toHaveTextContent("code.merge");
		await user.click(panel.getByRole("switch", { name: "Admin" }));
		await user.type(panel.getByRole("textbox", { name: /^Right changes/ }), "-code.merge");
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().work.team.members.find((m) => m.handle === "grace")).toMatchObject({
				emails: ["grace@example.com"],
				role: "architect",
				admin: true,
				rights: ["-code.merge"],
			}),
		);
	});

	it("shows an unknown person the banner and sends a join request: with no code host, the branch stays local", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().person = {
			member: null,
			found: "unknown",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		mountApp("/work/team");
		expect(await screen.findByText("You are not in the team file")).toBeInTheDocument();
		const form = within(await screen.findByRole("form", { name: "Ask to join" }));
		await user.type(form.getByRole("textbox", { name: "Name" }), "Zed Nobody");
		await user.type(form.getByRole("textbox", { name: "E-mails" }), "zed@example.com");
		await user.click(form.getByRole("button", { name: "Send the request" }));
		expect(await form.findByText("git push origin shipyard/join-zed")).toBeInTheDocument();
		expect(form.getByRole("button", { name: "Copied" })).toBeInTheDocument();
		expect(
			joinEntry({ name: "Zed Nobody", email: "zed@example.com", account: "", role: "qa" }),
		).toContain("role: viewer");
	});

	it("proposes the roles of this machine as members and drops them from the registry after one click", async () => {
		const user = userEvent.setup();
		await withTracker();
		const project = (await unwrap(commands.projectsActive()))?.overrides;
		if (!project) throw new Error("no project");
		await unwrap(
			commands.projectOverridesSave({
				...project,
				assignments: { "eve@example.com": "lead", "joe@example.com": "junior" },
				pageModes: { junior: { "code/terminal": "hidden" } },
			}),
		);
		mountApp("/work/team");
		const panel = within(
			await screen.findByRole("region", {
				name: "Move the roles of this machine to the team file",
			}),
		);
		expect(panel.getByText("eve@example.com")).toBeInTheDocument();
		expect(panel.getByText(/code\/terminal hidden/)).toBeInTheDocument();
		await user.click(panel.getByRole("button", { name: "Move the roles" }));
		await waitFor(() =>
			expect(
				mockState().work.team.members.find((m) => m.emails?.[0] === "joe@example.com"),
			).toMatchObject({
				role: "developer",
				rights: ["-code.merge", "-runs.approve"],
			}),
		);
		expect(
			mockState().work.team.members.find((m) => m.emails?.[0] === "eve@example.com")?.role,
		).toBe("po");
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.overrides.assignments).toBeNull(),
		);
	});

	it("lists the audit tail for a person with project.settings", async () => {
		await withTracker();
		mockState().audit = [
			{
				time: 1_700_000_000,
				member: null,
				found: "unknown",
				right: "work.edit",
				what: "work_transition",
				target: "ACME-1",
				result: "refused",
			},
		];
		mountApp("/work/team");
		const log = within(await screen.findByRole("table", { name: "Audit" }));
		expect(log.getByText("work_transition")).toBeInTheDocument();
		expect(log.getByText("refused")).toBeInTheDocument();
	});
});
