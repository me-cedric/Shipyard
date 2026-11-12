import type { ColumnDef } from "@tanstack/react-table";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearViewState } from "@/lib/shell/view-state";
import { renderApp } from "../test-utils";
import { DataTable } from "./data-table";

type Row = { id: string; a: string; b: string };
const columns: ColumnDef<Row>[] = [
	{ id: "a", header: "Alpha", accessorKey: "a" },
	{ id: "b", header: "Beta", accessorKey: "b" },
];
const data: Row[] = [{ id: "1", a: "one", b: "two" }];

const mount = () =>
	renderApp(
		<div style={{ height: 300, display: "flex" }}>
			<DataTable columns={columns} data={data} rowId={(r) => r.id} label="Things" memory="t" />
		</div>,
	);

afterEach(clearViewState);

describe("DataTable columns", () => {
	it("puts each handle in its own column and resizes only that column", () => {
		mount();
		const alpha = screen.getByRole("separator", { name: "Alpha width" });
		const beta = screen.getByRole("separator", { name: "Beta width" });
		const [first, second] = screen.getAllByRole("columnheader");
		expect(alpha.parentElement).toBe(first);
		expect(beta.parentElement).toBe(second);
		expect(alpha.parentElement).toHaveClass("relative");
		fireEvent.keyDown(beta, { key: "ArrowRight" });
		expect(beta).toHaveAttribute("aria-valuenow", "136");
		expect(alpha).toHaveAttribute("aria-valuenow", "120");
		fireEvent.keyDown(alpha, { key: "ArrowLeft" });
		expect(alpha).toHaveAttribute("aria-valuenow", "104");
		expect(beta).toHaveAttribute("aria-valuenow", "136");
	});

	it("lists the columns as checkbox items and hides one", async () => {
		const user = userEvent.setup();
		mount();
		await user.click(screen.getByRole("button", { name: "Columns" }));
		const alpha = await screen.findByRole("menuitemcheckbox", { name: "Alpha" });
		expect(alpha).toHaveAttribute("aria-checked", "true");
		await user.click(alpha);
		expect(screen.queryByText("Alpha", { selector: "[role=columnheader]" })).toBeNull();
		expect(screen.getByRole("menuitemcheckbox", { name: "Alpha" })).toHaveAttribute(
			"aria-checked",
			"false",
		);
		// The last visible column stays.
		expect(screen.getByRole("menuitemcheckbox", { name: "Beta" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	});
});

describe("DataTable row names", () => {
	it("shows a row header cell and a row label", () => {
		renderApp(
			<div style={{ height: 300, display: "flex" }}>
				<DataTable
					columns={[
						{ ...columns[0], meta: { rowHeader: true } } as ColumnDef<Row>,
						columns[1] as ColumnDef<Row>,
					]}
					data={data}
					rowId={(r) => r.id}
					label="Things"
					rowLabel={(r) => `${r.id} levels`}
				/>
			</div>,
		);
		expect(screen.getByRole("rowheader", { name: "one" })).toBeInTheDocument();
		expect(screen.getByRole("row", { name: "1 levels" })).toBeInTheDocument();
	});
});

describe("DataTable flow mode", () => {
	it("keeps the rows in normal flow with an automatic height", () => {
		renderApp(<DataTable flow columns={columns} data={data} rowId={(r) => r.id} label="Things" />);
		const row = screen.getByRole("row", { name: /one/ });
		expect(row.style.height).toBe("");
		expect(row).toHaveClass("min-h-row");
		expect(row).not.toHaveClass("h-row");
		expect(row.closest("[data-index]")).toBeNull();
		expect(row.parentElement?.className).not.toContain("absolute");
		expect(screen.getByRole("columnheader", { name: "Alpha" })).toHaveAttribute("title", "Alpha");
	});
});
