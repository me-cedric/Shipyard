import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { parseFlows } from "@/lib/design";
import { mockState } from "@/lib/ipc/mock";
import { Api } from "./api";
import { Decisions } from "./decisions";
import { Flows } from "./flows";
import { mountDesign } from "./harness";

// Typing is slow on a busy machine.
vi.setConfig({ testTimeout: 15_000 });

const files = () => mockState().design.files;
// The frame and the inspector hold chips with the same names: look in the list only.
const row = async (name: string | RegExp) =>
	within(await screen.findByRole("list", { name: /^(Decisions|Décisions|API|Flows)$/ })).findByRole(
		"button",
		{ name },
	);
const ADR3 = "docs/decisions/0003-ship-a-browser-mock.md";
const FLOWS = "docs/flows/network.yaml";

describe("Design / Decisions", () => {
	it("lists the ADRs with number, title and status", async () => {
		await mountDesign(<Decisions />);
		const list = await screen.findByRole("list", { name: "Decisions" });
		expect(within(list).getAllByRole("listitem")).toHaveLength(4);
		const third = within(list).getByRole("button", { name: /0003/ });
		expect(third).toHaveTextContent("Ship a browser mock");
		expect(third).toHaveTextContent("Proposed");
		expect(within(list).getByRole("button", { name: /0001/ })).toHaveTextContent("Accepted");
	});

	it("creates an ADR with the next number and the status proposed", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.click(await screen.findByRole("button", { name: "ADR" }));
		const dialog = within(await screen.findByRole("dialog"));
		await user.type(dialog.getByRole("textbox", { name: "Name" }), "Use queues");
		await user.click(dialog.getByRole("button", { name: "Create" }));
		await waitFor(() => expect(files()["docs/decisions/0005-use-queues.md"]).toBeDefined());
		expect(files()["docs/decisions/0005-use-queues.md"]?.text).toContain("status: proposed");
		expect(await row(/0005/)).toHaveTextContent("Proposed");
	});

	it("accepts a proposed ADR with a comment, and writes status, date and comment", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.click(await row(/0003/));
		await user.type(await screen.findByRole("textbox", { name: "Comment" }), "Fits the plan");
		await user.click(screen.getByRole("button", { name: "Accept" }));
		await waitFor(() => expect(files()[ADR3]?.text).toContain("status: accepted"));
		expect(files()[ADR3]?.text).toContain('comment: "Fits the plan"');
		expect(files()[ADR3]?.text).toMatch(/date: \d{4}-\d{2}-\d{2}/);
		// The decision is done: the form gives way.
		await waitFor(() => expect(screen.queryByRole("button", { name: "Accept" })).toBeNull());
		expect(await row(/0003/)).toHaveTextContent("Accepted");
	});

	it("marks the comment as required, keeps both buttons off until it has text, then rejects", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.click(await row(/0003/));
		const box = await screen.findByRole("textbox", { name: "Comment" });
		expect(box).toHaveAttribute("aria-required", "true");
		expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
		expect(files()[ADR3]?.text).toContain("status: proposed");
		await user.type(box, "Too early");
		await user.click(screen.getByRole("button", { name: "Reject" }));
		await waitFor(() => expect(files()[ADR3]?.text).toContain("status: rejected"));
	});

	it("marks a decision that no spec cites, and the Unused filter keeps only those", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		const all = (await screen.findAllByRole("button", { name: /^\d{4}/ })).length;
		const marked = (await screen.findAllByText("Unused", { selector: "span" })).filter(
			(e) => e.closest("li") !== null,
		);
		expect(marked.length).toBeGreaterThan(0);
		expect(marked.length).toBeLessThan(all);
		await user.click(screen.getByRole("button", { name: "Unused", pressed: false }));
		await waitFor(() =>
			expect(screen.getAllByRole("button", { name: /^\d{4}/ })).toHaveLength(marked.length),
		);
	});

	it("keeps the ref when the title changes", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.click(await row(/0003/));
		// The record opens in its form: the title is one field.
		const title = await screen.findByRole("textbox", { name: "Title" });
		await user.clear(title);
		await user.type(title, "Mock in the browser");
		await user.click(screen.getByRole("button", { name: "Save" }));
		const item = await row(/0003/);
		await waitFor(() => expect(item).toHaveTextContent("Mock in the browser"));
		expect(screen.getAllByText("adr:0003").length).toBeGreaterThan(0);
	});
});

describe("Design / API", () => {
	const op = (summary: string) => screen.getByText(summary).closest("details") as HTMLElement;

	it("lists the contracts with title and version, and groups endpoints by tag", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		const item = await row(/Orders API/);
		expect(item).toHaveTextContent("1.2.0");
		await user.click(item);
		expect(await screen.findByRole("region", { name: "orders" })).toBeInTheDocument();
		expect(screen.getByRole("region", { name: "customers" })).toBeInTheDocument();
		// Method, path, parameters and responses.
		const read = within(op("Read one order"));
		expect(read.getAllByText("GET").length).toBeGreaterThan(0);
		expect(read.getByText("/orders/{id}")).toBeInTheDocument();
		expect(read.getByText("404")).toBeInTheDocument();
	});

	it("sends a GET request and shows the status and the body", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		await user.click(await row(/Orders API/));
		await user.click(await screen.findByText("List the orders"));
		await user.click(within(op("List the orders")).getByRole("button", { name: "Send" }));
		const out = await within(op("List the orders")).findByRole("status");
		expect(out).toHaveTextContent("200");
		expect(out).toHaveTextContent("o-1");
	});

	it("names the server and waits for one click before a request that is not GET", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		await user.click(await row(/Orders API/));
		await user.click(await screen.findByText("Create an order"));
		await user.click(within(op("Create an order")).getByRole("button", { name: "Send" }));
		const dialog = within(await screen.findByRole("dialog", { name: /POST to https:\/\// }));
		expect(within(op("Create an order")).queryByRole("status")).toBeNull();
		await user.click(dialog.getByRole("button", { name: "Send" }));
		const out = await within(op("Create an order")).findByRole("status");
		expect(out).toHaveTextContent("201");
	});

	it("sends nothing when the person closes the dialog", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		await user.click(await row(/Orders API/));
		await user.click(await screen.findByText("Create an order"));
		await user.click(within(op("Create an order")).getByRole("button", { name: "Send" }));
		await user.click(
			await within(await screen.findByRole("dialog")).findByRole("button", { name: "Close" }),
		);
		expect(await within(op("Create an order")).findByRole("alert")).toHaveTextContent("Cancelled");
		expect(within(op("Create an order")).queryByRole("status")).toBeNull();
	});

	it("shows the failure and no response when the call fails", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		await user.click(await row(/Orders API/));
		await user.click(await screen.findByText("List the orders"));
		const panel = within(op("List the orders"));
		await user.clear(panel.getByRole("textbox", { name: "Path" }));
		await user.type(panel.getByRole("textbox", { name: "Path" }), "no-slash");
		await user.click(panel.getByRole("button", { name: "Send" }));
		expect(await panel.findByRole("alert")).toHaveTextContent("Failed");
		expect(panel.queryByRole("status")).toBeNull();
	});

	it("shows the error and no endpoint for a contract that is not valid", async () => {
		const user = userEvent.setup();
		files()["docs/api/bad.yaml"] = { text: "openapi: 3.0.3\npaths: [", stamp: "1" };
		await mountDesign(<Api />);
		const item = await row(/bad/);
		expect(item).toHaveTextContent("Not readable");
		await user.click(item);
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		expect(screen.queryByText("GET")).toBeNull();
	});
});

describe("Design / Flows", () => {
	const table = async () => within(await screen.findByRole("table"));
	const open = async (user: ReturnType<typeof userEvent.setup>) => {
		await mountDesign(<Flows />);
		await user.click(await row(/network/));
	};
	const bodyRows = async () => (await table()).getAllByRole("row").length - 1;
	const saved = () => parseFlows(files()[FLOWS]?.text ?? "").rows;

	it("shows the rows with a count in the heading", async () => {
		await open(userEvent.setup());
		expect(await screen.findByRole("heading", { name: "Flows (20)" })).toBeInTheDocument();
		expect(await bodyRows()).toBe(20);
	});

	it("combines the filters: one VLAN and deny", async () => {
		const user = userEvent.setup();
		await open(user);
		await screen.findByRole("table");
		await user.click(screen.getByRole("combobox", { name: "VLAN or VNET" }));
		await user.click(await screen.findByRole("option", { name: "VLAN 20" }));
		expect(await bodyRows()).toBe(10);
		await user.click(screen.getByRole("combobox", { name: "Action" }));
		await user.click(await screen.findByRole("option", { name: "Deny" }));
		expect(await bodyRows()).toBe(2);
		await user.type(screen.getByRole("textbox", { name: "Search" }), "icmp");
		expect(await bodyRows()).toBe(1);
	});

	it("rejects a row with a missing field, names it and writes nothing", async () => {
		const user = userEvent.setup();
		await open(user);
		await user.click(await screen.findByRole("button", { name: "Flow" }));
		await user.type(screen.getByRole("textbox", { name: "Source" }), "10.1.0.0/24");
		await user.type(screen.getByRole("textbox", { name: "Destination" }), "10.2.0.0/24");
		await user.type(screen.getByRole("textbox", { name: "VLAN or VNET" }), "VLAN 30");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Protocol: Required");
		expect(saved()).toHaveLength(20);
	});

	it("adds, edits and removes a row", async () => {
		const user = userEvent.setup();
		await open(user);
		await user.click(await screen.findByRole("button", { name: "Flow" }));
		await user.type(screen.getByRole("textbox", { name: "Source" }), "10.1.0.0/24");
		await user.type(screen.getByRole("textbox", { name: "Destination" }), "10.2.0.0/24");
		await user.type(screen.getByRole("textbox", { name: "VLAN or VNET" }), "VLAN 30");
		await user.type(screen.getByRole("textbox", { name: "Protocol" }), "tcp");
		await user.click(screen.getAllByRole("combobox", { name: "Action" }).at(-1) as HTMLElement);
		await user.click(await screen.findByRole("option", { name: "Allow" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(saved()).toHaveLength(21));
		expect(saved().at(-1)).toMatchObject({ id: 21, network: "VLAN 30", action: "allow" });

		await user.click(await screen.findByRole("button", { name: "Edit 10.1.0.0/24 10.2.0.0/24" }));
		const protocol = screen.getByRole("textbox", { name: "Protocol" });
		await user.clear(protocol);
		await user.type(protocol, "udp");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(saved().at(-1)?.protocol).toBe("udp"));

		await user.click(await screen.findByRole("button", { name: "Remove 10.1.0.0/24 10.2.0.0/24" }));
		await waitFor(() => expect(saved()).toHaveLength(20));
		// A row that kept its note keeps it after another row changes.
		expect(saved()[0]).toMatchObject({ note: "Web portal" });
	});

	it("adds a brick, picks it in a flow with a name and a subnet, and follows a rename", async () => {
		const user = userEvent.setup();
		await open(user);
		await user.click(await screen.findByRole("tab", { name: "Bricks" }));
		await user.type(await screen.findByRole("textbox", { name: "Brick name" }), "Web");
		await user.click(screen.getByRole("button", { name: "Brick" }));
		await waitFor(() => expect(files()["docs/flows/bricks.json"]?.text).toContain('"Web"'));
		await user.click(screen.getByRole("tab", { name: "Flows" }));
		await user.click((await screen.findAllByRole("button", { name: /^Edit / }))[0] as HTMLElement);
		await user.click(await screen.findByRole("combobox", { name: "Source brick" }));
		await user.click(await screen.findByRole("option", { name: "Web" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "portal");
		await user.type(screen.getByRole("textbox", { name: "Subnet" }), "10.0.0.0/24");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(saved()[0]).toMatchObject({
				sourceName: "Web",
				name: "portal",
				subnet: "10.0.0.0/24",
			}),
		);
		await user.click(screen.getByRole("tab", { name: "Bricks" }));
		const field = await screen.findByRole("textbox", { name: "Brick name Web" });
		await user.clear(field);
		await user.type(field, "Frontend");
		await user.tab();
		await waitFor(() => expect(saved()[0]?.sourceName).toBe("Frontend"));
		expect(files()["docs/flows/bricks.json"]?.text).toContain('"Frontend"');
	});
});

describe("Design in French", () => {
	it("shows the labels and the statuses in French", async () => {
		mockState().prefs.lang = "fr";
		await mountDesign(<Decisions />);
		expect(await screen.findByRole("button", { name: "ADR" })).toBeInTheDocument();
		expect(await row(/0003/)).toHaveTextContent("Proposée");
		expect(screen.getByRole("list", { name: "Décisions" })).toBeInTheDocument();
	});
});
