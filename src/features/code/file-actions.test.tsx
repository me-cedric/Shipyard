import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const alpha = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const bar = async () => within((await screen.findAllByRole("banner"))[0] as HTMLElement);

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
	await alpha();
	mountApp("/home/inbox");
	await (await bar()).findByRole("button", { name: "Files" });
	await user.keyboard("{Control>}p{/Control}");
	return screen.findByRole("complementary", { name: "Files" });
}

describe("File drawer actions (Legacy file browser)", () => {
	it("makes a new file and a new folder, renames, and moves to the trash after a click", async () => {
		const user = userEvent.setup();
		const drawer = await openDrawer(user);
		await user.click(within(drawer).getByRole("button", { name: "New file" }));
		await user.type(await screen.findByRole("textbox", { name: "Name" }), "notes.md");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await within(drawer).findByRole("button", { name: "notes.md" });
		expect(mockState().code?.files["notes.md"]?.work).toBe("");

		await user.click(within(drawer).getByRole("button", { name: "New folder" }));
		await user.type(await screen.findByRole("textbox", { name: "Name" }), "empty");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await within(drawer).findByRole("button", { name: "empty" });

		await user.pointer({
			keys: "[MouseRight]",
			target: within(drawer).getByRole("button", { name: "notes.md" }),
		});
		await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
		const name = await screen.findByRole("textbox", { name: "Name" });
		await user.clear(name);
		await user.type(name, "todo.md");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await within(drawer).findByRole("button", { name: "todo.md" });
		expect(mockState().code?.files["notes.md"]).toBeUndefined();

		await user.pointer({
			keys: "[MouseRight]",
			target: within(drawer).getByRole("button", { name: "todo.md" }),
		});
		await user.click(await screen.findByRole("menuitem", { name: "Move to trash" }));
		await user.click(screen.getByRole("button", { name: "Move to trash" }));
		await waitFor(() => expect(mockState().code?.trash).toEqual(["todo.md"]));
		expect(within(drawer).queryByRole("button", { name: "todo.md" })).toBeNull();
	}, 20_000);

	it("shows no write action in a read-only project and refuses a path in .git", async () => {
		const user = userEvent.setup();
		await alpha();
		await unwrap(commands.projectOverridesSave({ readOnly: true } as never)).catch(() => {});
		mountApp("/home/inbox");
		await (await bar()).findByRole("button", { name: "Files" });
		await user.keyboard("{Control>}p{/Control}");
		const drawer = await screen.findByRole("complementary", { name: "Files" });
		expect(within(drawer).queryByRole("button", { name: "New file" })).toBeNull();
		await expect(unwrap(commands.filesCreateFile("x.txt", true))).rejects.toThrow(/read only/);
		await expect(unwrap(commands.filesCreateFile(".git/x", true))).rejects.toBeTruthy();
	}, 20_000);
});
