import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { addRef } from "./link-design";

const PROPOSAL = "docs/openspec/changes/add-auth/proposal.md";
const AUTH = "/flow/feature/change%3Aadd-auth?section=design";
const text = () => mockState().specs.files[PROPOSAL]?.text ?? "";
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

afterEach(() => vi.restoreAllMocks());

describe("addRef", () => {
	it("adds the heading once, then each ref under it, and skips a ref that is there", () => {
		const one = addRef("# x\n\n## Why\n\nText.\n", "screen:home") ?? "";
		expect(one).toContain("## Design items\n\n- screen:home\n");
		const two = addRef(`${one}\n## Next\n\nMore.\n`, "diagram:context") ?? "";
		expect(two.indexOf("- diagram:context")).toBeLessThan(two.indexOf("## Next"));
		expect(two.match(/## Design items/g)).toHaveLength(1);
		expect(addRef(two, "screen:home")).toBeNull();
	});

	it("finds the heading in a CRLF text and on the first line", () => {
		const crlf = addRef("# x\r\n\r\n## Design items\r\n\r\n- screen:home\r\n", "screen:cart") ?? "";
		expect(crlf.match(/## Design items/g)).toHaveLength(1);
		expect(crlf).toContain("- screen:cart");
		const first = addRef("## Design items\n", "screen:cart") ?? "";
		expect(first.match(/## Design items/g)).toHaveLength(1);
	});
});

describe("Feature page / Link a design item", () => {
	it("writes the ref once, shows the item, and writes nothing for a second pick", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const write = vi.spyOn(commands, "specsWrite");
		const router = mountApp(AUTH);
		const card = within(await screen.findByRole("region", { name: "Screens" }));
		const pick = async () => {
			await user.click(await card.findByRole("button", { name: "Link a screen" }));
			const dialog = within(await screen.findByRole("dialog"));
			await user.click(await dialog.findByRole("radio", { name: "Checkout" }));
			await user.click(dialog.getByRole("button", { name: "Link" }));
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		};
		await pick();
		expect(text()).toContain("## Design items\n\n- screen:checkout\n");
		expect(await card.findByRole("button", { name: "Checkout" })).toBeVisible();
		expect(write).toHaveBeenCalledTimes(1);
		await pick();
		expect(write).toHaveBeenCalledTimes(1);
		await idle(router);
	});

	it("shows no link action for a feature with no change, and keeps the Library button", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/flow/feature/wi%3AACME-9?section=design");
		const card = within(await screen.findByRole("region", { name: "Screens" }));
		expect(await card.findByRole("button", { name: "Open the screens" })).toBeVisible();
		expect(card.queryByRole("button", { name: "Link a screen" })).toBeNull();
		await idle(router);
	});

	it("shows the conflict of an old stamp, and clears it when the dialog opens again", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		vi.spyOn(commands, "specsWrite").mockResolvedValueOnce({
			status: "ok",
			data: { conflict: true, stamp: "x" },
		});
		const router = mountApp(AUTH);
		const card = within(await screen.findByRole("region", { name: "Screens" }));
		await user.click(await card.findByRole("button", { name: "Link a screen" }));
		const dialog = within(await screen.findByRole("dialog"));
		await user.click(await dialog.findByRole("radio", { name: "Checkout" }));
		await user.click(dialog.getByRole("button", { name: "Link" }));
		expect(await dialog.findByRole("alert")).toBeVisible();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await user.click(await card.findByRole("button", { name: "Link a screen" }));
		const again = within(await screen.findByRole("dialog"));
		expect(again.queryByRole("alert")).toBeNull();
		expect(again.getByRole("radio", { name: "Checkout" })).toHaveAttribute("aria-checked", "false");
		await idle(router);
	});

	it("creates the proposal when the change has none", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const write = vi.spyOn(commands, "specsWrite");
		const router = mountApp(AUTH);
		const card = within(await screen.findByRole("region", { name: "Screens" }));
		const read = commands.specsRead;
		vi.spyOn(commands, "specsRead").mockImplementation(async (path) =>
			path === PROPOSAL
				? { status: "error", error: { code: "unknown", details: "no such file", action: null } }
				: read(path),
		);
		await user.click(await card.findByRole("button", { name: "Link a screen" }));
		const dialog = within(await screen.findByRole("dialog"));
		await user.click(await dialog.findByRole("radio", { name: "Checkout" }));
		await user.click(dialog.getByRole("button", { name: "Link" }));
		await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
		expect(write.mock.calls[0]?.[2]).toBeNull();
		expect(write.mock.calls[0]?.[3]).toBe(true);
		await idle(router);
	});

	it("disables the link button for a role without the right to edit specs", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().person = {
			member: "eve",
			found: "email",
			role: "pm",
			admin: false,
			readOnly: false,
			rights: ["costs.view"],
		};
		const router = mountApp(AUTH);
		const card = within(await screen.findByRole("region", { name: "Screens" }));
		expect(await card.findByRole("button", { name: "Link a screen" })).toBeDisabled();
		await idle(router);
	});
});
