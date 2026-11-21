import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

// spec:library-functions#REQ-001
describe("Opened last keeps items", () => {
	beforeEach(() => unwrap(commands.projectsOpen("/mock/alpha", false)));

	it("shows a row with the kind chip, the item name and Pin for an opened spec", async () => {
		const user = userEvent.setup();
		const router = mountApp("/library/capabilities");
		await user.click(await screen.findByRole("button", { name: /^billing/ }));
		const name = (await unwrap(commands.refsResolve("spec:billing")))?.title ?? "billing";
		await user.click(
			await within(await screen.findByRole("main")).findByRole("link", { name: en.library.back }),
		);
		const last = await screen.findByRole("region", { name: en.library.openedLast });
		const row = within(last).getByRole("link", { name });
		expect(within(last).getByText(en.refKind.spec)).toBeVisible();
		await user.click(within(last).getByRole("button", { name: `Pin ${name}` }));
		const pinned = await screen.findByRole("region", { name: en.library.pinned });
		expect(within(pinned).getByRole("link", { name })).toBeVisible();
		await user.click(row);
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/capabilities"));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("keeps pages and items together, the newest first, five at most", async () => {
		const router = mountApp("/library/home");
		await screen.findByRole("heading", { level: 1, name: en.library.title });
		const { noteOpened } = await import("./recent");
		for (const ref of ["spec:a", "adr:0001", "diagram:x", "doc:docs/handbook/a.md", "spec:b"])
			noteOpened(ref);
		noteOpened("handbook");
		const { readView, viewProjectNow } = await import("@/lib/shell/view-state");
		expect(readView<string[]>(viewProjectNow(), "library/recent", [])).toEqual([
			"handbook",
			"spec:b",
			"doc:docs/handbook/a.md",
			"diagram:x",
			"adr:0001",
		]);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
