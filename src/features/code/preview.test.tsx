import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedCode } from "@/lib/ipc/mock-code";
import { mountApp } from "@/test/mount";

async function pick(name: string) {
	const user = userEvent.setup();
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const code = seedCode();
	code.files["me.png"] = { head: null, index: null, work: "png" };
	code.files["old.png"] = { head: "a", index: "b", work: "b" };
	code.files["a.bin"] = { head: null, index: null, work: "xyz" };
	mockState().code = code;
	mountApp("/code/changes");
	await user.click(await screen.findByRole("button", { name }));
}

describe("Code / Changes preview", () => {
	it("shows an untracked image from the working copy", async () => {
		await pick("me.png");
		const img = await screen.findByRole("img", { name: "me.png" });
		expect(img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
	});

	it("shows the old and the new image of a modified image side by side", async () => {
		await pick("old.png");
		const main = within(screen.getByRole("main"));
		expect(await main.findByRole("img", { name: "Before: old.png" })).toBeInTheDocument();
		expect(main.getByRole("img", { name: "After: old.png" })).toBeInTheDocument();
	});

	it("shows one line with the kind and the size when there is no preview", async () => {
		await pick("a.bin");
		await waitFor(() =>
			expect(screen.getByText("No preview · Binary file · 3 B")).toBeInTheDocument(),
		);
	});
});
