import { act, renderHook, screen } from "@testing-library/react";
import { renderApp } from "@/ui/test-utils";
import { COPIED_MS, copyText, type Handlers, MENU, useCopy, useMenus } from "./index";

function Items({ handlers }: { handlers: Handlers }) {
	const menu = useMenus();
	return (
		<p>
			{menu("connection", handlers)
				.map((i) => i.id)
				.join(",")}
		</p>
	);
}

describe("context menu table", () => {
	it("lists the actions of a kind in the order of the table and leaves out an action with no handler", () => {
		const run = () => {};
		renderApp(<Items handlers={{ "copy-ref": run, test: run, remove: run }} />);
		expect(screen.getByText("test,remove,copy-ref")).toBeInTheDocument();
	});

	it("has one entry for each kind of row", () => {
		expect(Object.keys(MENU).sort()).toEqual([
			"adr",
			"branch",
			"commit",
			"connection",
			"file",
			"project",
			"pull",
			"ref",
			"run",
			"spec",
			"ticket",
		]);
	});
});

describe("item actions", () => {
	it("offers Open in browser on a ticket and a pull request, and Show in folder on a file", () => {
		expect(MENU.ticket).toContain("open-browser");
		expect(MENU.pull).toContain("open-browser");
		expect(MENU.file).toEqual(expect.arrayContaining(["reveal", "open-default"]));
	});

	it("shows Copied for 1.5 s after a copy that worked, and not after a failed one", async () => {
		vi.useFakeTimers();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });
		const { result } = renderHook(() => useCopy());
		await act(() => result.current.copy("wi:A-1"));
		expect(writeText).toHaveBeenCalledWith("wi:A-1");
		expect(result.current.copied).toBe(true);
		act(() => vi.advanceTimersByTime(COPIED_MS));
		expect(result.current.copied).toBe(false);
		writeText.mockRejectedValue(new Error("denied"));
		expect(await copyText("x")).toBe(false);
		await act(() => result.current.copy("x"));
		expect(result.current.copied).toBe(false);
		vi.useRealTimers();
	});
});
