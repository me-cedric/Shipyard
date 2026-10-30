import { screen } from "@testing-library/react";
import { renderApp } from "@/ui/test-utils";
import { type Handlers, MENU, useMenus } from "./index";

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
			"pull",
			"ref",
			"run",
			"spec",
			"ticket",
		]);
	});
});
