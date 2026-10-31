import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountDesign } from "./harness";
import { Screens } from "./screens";

describe("Design / Screens: Figma and the .fig viewer", () => {
	it("keeps the token in the keychain, lists the files of a project, previews one and reads its tokens", async () => {
		const user = userEvent.setup();
		await mountDesign(<Screens />);
		await user.click(
			await within(await screen.findByRole("list", { name: "Screens" })).findByRole("button", {
				name: /Home/,
			}),
		);
		const figma = await screen.findByRole("region", { name: "Figma" });
		await user.type(within(figma).getByLabelText("Figma token"), "figd_secret");
		await user.click(within(figma).getByRole("button", { name: "Save the token" }));
		await waitFor(() => expect(mockState().extras.figmaToken).toBe(true));
		await user.type(
			await within(figma).findByRole("textbox", { name: "Figma project address" }),
			"https://www.figma.com/files/project/42",
		);
		await user.click(within(figma).getByRole("button", { name: "List the files" }));
		const files = await within(figma).findByRole("list", { name: "Figma files" });
		expect(within(files).getByText("Checkout")).toBeInTheDocument();
		await user.click(within(files).getByRole("button", { name: "Preview Checkout" }));
		expect(await within(figma).findByRole("img", { name: "Checkout" })).toBeInTheDocument();
		await user.click(within(files).getByRole("button", { name: "Tokens of Checkout" }));
		const tokens = await within(figma).findByRole("list", { name: "Design tokens" });
		expect(within(tokens).getByText("color/primary")).toBeInTheDocument();
	});

	it("refuses a Figma read without a token", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await expect(unwrap(commands.figmaFiles("42"))).rejects.toThrow(
			"Add the token of your Figma account",
		);
	});

	it("shows the preview that a .fig file holds", async () => {
		const v = await unwrap(commands.designFigView("docs/designs/checkout.fig"));
		expect(v.name).toBe("checkout");
		expect(v.thumbnail?.slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
	});
});
