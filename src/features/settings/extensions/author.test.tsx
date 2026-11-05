import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { BROKEN_DIR, PLUGIN_DIR, PLUGIN_PATH } from "@/lib/ipc/mock-extensions";
import { mountTab } from "./harness";

const field = () => screen.findByRole("textbox", { name: "Plugin archive path" });

describe("Settings / Extensions: plugin author tools", () => {
	it("picks a zip with the file picker", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		mockState().nextFile = PLUGIN_PATH;
		await user.click(await screen.findByRole("button", { name: "Choose a zip" }));
		await waitFor(async () => expect(await field()).toHaveValue(PLUGIN_PATH));
		await user.click(screen.getByRole("button", { name: "Review" }));
		expect(await screen.findByRole("heading", { name: "New (4)" })).toBeInTheDocument();
	});

	it("copies the sample to a picked folder and opens it as a project", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		mockState().nextFolder = "/mock/work";
		await user.click(await screen.findByRole("button", { name: "New plugin" }));
		await waitFor(async () => expect(await field()).toHaveValue("/mock/work/acme-sample"));
		expect(mockState().projects.some((p) => p.path === "/mock/work/acme-sample")).toBe(true);
	});

	it("tries a folder in this project and shows the filled file", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		await user.type(await field(), PLUGIN_DIR);
		await user.click(screen.getByRole("button", { name: "Try in this project" }));
		expect(await screen.findByRole("heading", { name: "New (4)" })).toBeInTheDocument();
		expect(screen.getByText("Team: core")).toBeInTheDocument();
		expect(mockState().extensions.files).not.toContain("docs/team.md");
	});

	it("packages a folder to a zip", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		await user.type(await field(), PLUGIN_DIR);
		await user.click(screen.getByRole("button", { name: "Package" }));
		expect(await screen.findByText("Package written: /mock/team-kit.zip")).toBeInTheDocument();
		expect(mockState().extensions.packaged).toEqual(["/mock/team-kit.zip"]);
	});

	it("shows a manifest fault with its line and opens that line", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		await user.type(await field(), BROKEN_DIR);
		await user.click(screen.getByRole("button", { name: "Try in this project" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("manifest.json line 4: unknown field `colour`");
		await user.click(within(alert).getByRole("button", { name: "Open manifest.json line 4" }));
		await waitFor(() =>
			expect(mockState().extensions.openedLines).toEqual([{ dir: BROKEN_DIR, line: 4 }]),
		);
	});

	it("shows the files that a saved setting changes through the review", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		await user.type(await field(), PLUGIN_PATH);
		await user.click(screen.getByRole("button", { name: "Review" }));
		await user.click(await screen.findByRole("button", { name: "Apply plugin (4)" }));
		await user.click(await screen.findByRole("button", { name: "Settings of team-kit" }));
		const form = await screen.findByRole("form", { name: "Settings of team-kit" });
		await user.click(within(form).getByRole("combobox", { name: "team" }));
		await user.click(await screen.findByRole("option", { name: "web" }));
		await user.click(within(form).getByRole("button", { name: "Save settings" }));
		expect(await screen.findByRole("heading", { name: "Same (4)" })).toBeInTheDocument();
	});
});
