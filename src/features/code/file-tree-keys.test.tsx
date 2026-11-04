import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { commands, unwrap } from "@/lib/ipc";
import { FileDrawer } from "./file-drawer";

async function open() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	render(
		<Providers>
			<FileDrawer onClose={() => {}} />
		</Providers>,
	);
	return userEvent.setup();
}

describe("File tree keys", () => {
	it("moves with the arrow keys and opens and closes a folder", async () => {
		const user = await open();
		const src = await screen.findByRole("button", { name: /^src$/ });
		await user.click(screen.getByRole("searchbox", { name: "Search files" }));
		await user.keyboard("{ArrowDown}");
		const first = document.activeElement as HTMLElement;
		expect(first.dataset.path).toBeDefined();
		src.focus();
		await user.keyboard("{ArrowRight}");
		expect(src).toHaveAttribute("aria-expanded", "true");
		await user.keyboard("{ArrowRight}");
		expect((document.activeElement as HTMLElement).dataset.path?.startsWith("src/")).toBe(true);
		await user.keyboard("{ArrowLeft}");
		expect(document.activeElement).toBe(src);
		await user.keyboard("{ArrowLeft}");
		expect(src).toHaveAttribute("aria-expanded", "false");
	});

	it("opens rename on F2 and a delete confirm on Delete", async () => {
		const user = await open();
		const src = await screen.findByRole("button", { name: /^src$/ });
		src.focus();
		await user.keyboard("{F2}");
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		src.focus();
		await user.keyboard("{Delete}");
		expect(await screen.findByRole("dialog")).toHaveTextContent("src");
	});

	it("also deletes on Cmd+Backspace and keeps one row in the Tab order", async () => {
		const user = await open();
		const src = await screen.findByRole("button", { name: /^src$/ });
		const rows = screen.getAllByRole("button").filter((b) => b.dataset.path);
		expect(rows.filter((b) => b.tabIndex === 0)).toHaveLength(1);
		act(() => src.focus());
		expect(rows.filter((b) => b.tabIndex === 0)).toEqual([src]);
		await user.keyboard("{Meta>}{Backspace}{/Meta}");
		expect(await screen.findByRole("dialog")).toHaveTextContent("src");
	});

	it("has a refresh control", async () => {
		const user = await open();
		await screen.findByRole("button", { name: /^src$/ });
		await user.click(screen.getByRole("button", { name: "Refresh files" }));
		expect(await screen.findByRole("button", { name: /^src$/ })).toBeInTheDocument();
	});
});
