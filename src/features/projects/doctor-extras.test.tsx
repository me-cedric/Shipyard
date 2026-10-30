import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Health / bootstrap, skills, console and feedback", () => {
	beforeEach(async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	});

	it("previews the files of the bootstrap form, then writes the new ones after a click", async () => {
		const user = userEvent.setup();
		mountApp("/settings/health");
		const create = await screen.findByRole("button", { name: "Create files" });
		expect(create).toBeDisabled();
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Demo");
		await user.type(screen.getByRole("textbox", { name: "Key" }), "demo");
		const files = await screen.findByRole("region", { name: "Files" });
		expect(within(files).getByText("BOOTSTRAP_PROMPT.md")).toBeInTheDocument();
		expect(within(files).getAllByText("New")).toHaveLength(4);
		await waitFor(() => expect(create).toBeEnabled());
		await user.click(create);
		expect(await screen.findByText("4 files created")).toBeInTheDocument();
		expect(mockState().bootstrap.files.size).toBe(4);
		await waitFor(() => expect(within(files).getAllByText("Kept")).toHaveLength(4));
		expect(create).toBeDisabled();
	});

	it("shows each skill as applied, stale or missing and fixes one after a click", async () => {
		const user = userEvent.setup();
		mountApp("/settings/health");
		const panel = await screen.findByRole("region", { name: "Skills" });
		await within(panel).findByText("ui-conformance");
		expect(within(panel).getAllByText("Missing").length).toBeGreaterThan(0);
		expect(within(panel).getAllByText("Stale").length).toBeGreaterThan(0);
		await user.click(within(panel).getByRole("button", { name: "Apply ui-conformance" }));
		await waitFor(() =>
			expect(
				within(panel).queryByRole("button", { name: "Apply ui-conformance" }),
			).not.toBeInTheDocument(),
		);
	});

	it("filters the debug console by level", async () => {
		const user = userEvent.setup();
		mountApp("/settings/health");
		const log = await screen.findByRole("list", { name: "Debug console" });
		expect(await within(log).findAllByRole("listitem")).toHaveLength(3);
		await user.click(screen.getByRole("combobox", { name: "Level" }));
		await user.click(await screen.findByRole("option", { name: "Error" }));
		await waitFor(() => expect(within(log).getAllByRole("listitem")).toHaveLength(1));
		expect(within(log).getByText(/port 47821/)).toBeInTheDocument();
	});

	it("opens a feedback issue only with a title and shows a refusal", async () => {
		const user = userEvent.setup();
		mountApp("/settings/health");
		const open = await screen.findByRole("button", { name: "Open on GitHub" });
		expect(open).toBeDisabled();
		await user.type(screen.getByRole("textbox", { name: "Title" }), "Crash");
		await user.type(
			screen.getByRole("textbox", { name: "Details" }),
			"ghp_abcdefghijklmnopqrstuvwxyz0123456789",
		);
		await user.click(open);
		expect(await screen.findByText(/looks like a secret/)).toBeInTheDocument();
	});

	it("propagates the parent items to a linked project after a click", async () => {
		const user = userEvent.setup();
		mountApp("/settings/health");
		const panel = await screen.findByRole("region", { name: "Linked projects" });
		await user.click(
			await within(panel).findByRole("button", { name: "Propagate to API gateway" }),
		);
		expect(await screen.findByText("Propagated to API gateway")).toBeInTheDocument();
	});
});
