import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const aside = async (name: string) => within(await screen.findByRole("complementary", { name }));

describe("Work / Team", () => {
	it("lists the members with role, capacity, skills and day rate", async () => {
		await withTracker();
		mountApp("/work/team");
		const ada = await screen.findByRole("group", { name: "ada" });
		expect(ada).toHaveTextContent("Ada Lovelace");
		expect(ada).toHaveTextContent("dev");
		expect(ada).toHaveTextContent("5 d/w");
		expect(ada).toHaveTextContent("api");
		expect(ada).toHaveTextContent("520/d");
		expect(screen.getAllByRole("group")).toHaveLength(5);
	});

	it("edits a member and writes the new capacity to the team", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/team");
		await user.click(
			within(await screen.findByRole("group", { name: "grace" })).getByRole("button"),
		);
		const panel = await aside("Grace Hopper");
		const capacity = panel.getByRole("spinbutton", { name: "Capacity (days a week)" });
		expect(capacity).toHaveValue(4);
		await user.clear(capacity);
		await user.type(capacity, "3");
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().work.team.members.find((m) => m.handle === "grace")?.capacity).toBe(3),
		);
		expect(await screen.findByRole("group", { name: "grace" })).toHaveTextContent("3 d/w");
	});

	it("adds a member with one primary action", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/team");
		await user.click(await screen.findByRole("button", { name: "Member" }));
		const panel = await aside("Member");
		await user.type(panel.getByRole("textbox", { name: "Name" }), "Barbara Liskov");
		await user.type(panel.getByRole("textbox", { name: "Handle" }), "barbara");
		await user.type(panel.getByRole("textbox", { name: "Role" }), "dev");
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().work.team.members).toHaveLength(6));
		// A second save replaces the member and adds none.
		await user.click((await aside("Barbara Liskov")).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(screen.getAllByRole("group", { name: /^[a-z]+$/ })).toHaveLength(6));
		expect(mockState().work.team.members).toHaveLength(6);
	});

	it("refuses a duplicate handle, names it and keeps the last valid team", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/team");
		await user.click(
			within(await screen.findByRole("group", { name: "grace" })).getByRole("button"),
		);
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
		const ada = await screen.findByRole("group", { name: "ada" });
		expect(ada).not.toHaveTextContent("520");
		expect(within(ada).getByRole("img", { name: "Passphrase missing" })).toBeInTheDocument();
		const field = screen.getByLabelText("Passphrase");
		// The field never shows what a person types.
		expect(field).toHaveAttribute("type", "password");
		await user.type(field, "wrong");
		await user.click(screen.getByRole("button", { name: "Unlock" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("does not open");
		expect(field).toHaveValue("");
		expect(screen.getByRole("group", { name: "ada" })).not.toHaveTextContent("520");
		await user.type(screen.getByLabelText("Passphrase"), "s3cret");
		await user.click(screen.getByRole("button", { name: "Unlock" }));
		await waitFor(() =>
			expect(screen.getByRole("group", { name: "ada" })).toHaveTextContent("520/d"),
		);
		expect(screen.queryByLabelText("Passphrase")).toBeNull();
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		mountApp("/work/team");
		expect(await screen.findByRole("button", { name: "Membre" })).toBeInTheDocument();
		expect(await screen.findByRole("group", { name: "ada" })).toHaveTextContent("5 j/s");
	});
});
