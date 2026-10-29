import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { BoardColumn } from "./board-column";
import { MemberRow } from "./member-row";
import { TicketCard } from "./ticket-card";
import { TicketRow } from "./ticket-row";

describe("TicketRow", () => {
	it("names the group by the key, shows the status as a shape and opens on a click", async () => {
		const open = vi.fn();
		renderApp(
			<TicketRow
				itemKey="ACME-1"
				title="Fix login"
				status="In Progress"
				category="in-progress"
				assignee="Ada"
				claimed="Claimed"
				onOpen={open}
			/>,
		);
		const row = screen.getByRole("group", { name: "ACME-1" });
		expect(within(row).getByText("Fix login")).toBeInTheDocument();
		expect(within(row).getByRole("img", { name: "In Progress" })).toHaveAttribute(
			"data-shape",
			"ring",
		);
		expect(within(row).getByRole("img", { name: "Claimed" })).toBeInTheDocument();
		await userEvent.click(within(row).getByRole("button"));
		expect(open).toHaveBeenCalled();
	});

	it("marks an assignee that the team lacks", () => {
		renderApp(
			<TicketRow
				itemKey="ACME-2"
				title="t"
				status="To Do"
				category="todo"
				assignee="Ghost"
				unknown="Unknown member"
				onOpen={() => {}}
			/>,
		);
		expect(screen.getByRole("img", { name: "Unknown member" })).toBeInTheDocument();
	});
});

describe("TicketCard and BoardColumn", () => {
	it("moves one column with Shift and an arrow, and a drop sends the key", () => {
		const move = vi.fn();
		const drop = vi.fn();
		renderApp(
			<BoardColumn title="To Do" category="todo" count={1} onDropKey={drop}>
				<TicketCard itemKey="ACME-1" title="Fix" onOpen={() => {}} onMove={move} />
			</BoardColumn>,
		);
		const card = screen.getByRole("button", { name: /ACME-1/ });
		fireEvent.keyDown(card, { key: "ArrowRight" });
		expect(move).not.toHaveBeenCalled();
		fireEvent.keyDown(card, { key: "ArrowRight", shiftKey: true });
		expect(move).toHaveBeenCalledWith(1);
		const data = { getData: () => "ACME-9", setData: () => {}, effectAllowed: "" };
		fireEvent.drop(screen.getByRole("region", { name: "To Do (1)" }), { dataTransfer: data });
		expect(drop).toHaveBeenCalledWith("ACME-9");
	});
});

describe("MemberRow", () => {
	it("shows the lock in place of a hidden rate", () => {
		renderApp(
			<MemberRow
				name="Ada"
				handle="ada"
				job="dev"
				capacity="5 d/w"
				skills={["api"]}
				lockedLabel="Passphrase missing"
				onOpen={() => {}}
			/>,
		);
		expect(screen.getByRole("img", { name: "Passphrase missing" })).toBeInTheDocument();
	});
});
