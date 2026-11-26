import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AskedQuestion_Serialize } from "@/lib/ipc";
import { renderApp } from "../test-utils";
import { EmptyState } from "./empty-state";
import { GroupSection } from "./group-section";
import { QuestionCard } from "./question-card";
import { RefChip } from "./ref-chip";
import { SpendMeter } from "./spend-meter";

const question: AskedQuestion_Serialize = {
	id: "Q-101",
	question: "Where should the user land?",
	options: ["The login page", "The home page"],
	recommended: 1,
	free_text: false,
	spec: null,
	state: "open",
	answer: null,
	unclear: null,
	edited: false,
};

describe("RefChip (REQ-005)", () => {
	it("shows the entity icon and the ref, and opens the entity on activation", async () => {
		const onOpen = vi.fn();
		const { container } = renderApp(<RefChip refId="wi:KEY-1" state="resolved" onOpen={onOpen} />);
		expect(screen.getByText("wi:KEY-1")).toBeInTheDocument();
		expect(container.querySelector("button svg")).not.toBeNull();
		await userEvent.click(screen.getByRole("button"));
		expect(onOpen).toHaveBeenCalledWith("wi:KEY-1");
	});

	it("shows resolved, unresolved and broken with distinct shapes and colours", () => {
		const seen = (["resolved", "unresolved", "broken"] as const).map((state) => {
			const { unmount, container } = renderApp(<RefChip refId="wi:KEY-1" state={state} />);
			const dot = container.querySelector("[data-shape]");
			const out = `${dot?.getAttribute("data-shape")}/${dot?.getAttribute("class")?.match(/text-\w+/)}`;
			unmount();
			return out;
		});
		expect(new Set(seen).size).toBe(3);
	});
});

describe("QuestionCard (REQ-005, REQ-010)", () => {
	it("shows the question and its options with one primary action", () => {
		renderApp(<QuestionCard question={question} onAnswer={() => {}} />);
		expect(screen.getByText("Where should the user land?")).toBeInTheDocument();
		expect(screen.getAllByRole("radio")).toHaveLength(2);
		const card = screen.getByRole("region", { name: "Q-101" });
		expect(within(card).getAllByRole("button")).toHaveLength(1);
	});

	it("answers with the keyboard alone", async () => {
		const onAnswer = vi.fn();
		renderApp(<QuestionCard question={question} onAnswer={onAnswer} />);
		await userEvent.tab();
		await userEvent.keyboard("2{Enter}");
		expect(onAnswer).toHaveBeenCalledWith({ kind: "option", n: 2 });
	});
});

describe("EmptyState (REQ-010)", () => {
	it("shows a title and one primary action", async () => {
		const onClick = vi.fn();
		renderApp(<EmptyState title="No pull requests" action={{ label: "Create", onClick }} />);
		expect(screen.getByText("No pull requests")).toBeInTheDocument();
		expect(screen.getAllByRole("button")).toHaveLength(1);
		await userEvent.click(screen.getByRole("button", { name: "Create" }));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("has no ghost row, so it never looks like loading", () => {
		const { container } = renderApp(
			<EmptyState title="No pull requests" action={{ label: "Create", onClick: () => {} }} />,
		);
		expect(container.innerHTML).not.toMatch(/animate-|bg-n-3/);
	});
});

describe("GroupSection (REQ-009)", () => {
	it("shows the count in the heading", () => {
		renderApp(
			<GroupSection name="Open" count={3}>
				<p>row</p>
			</GroupSection>,
		);
		expect(screen.getByRole("heading", { name: "Open (3)" })).toBeInTheDocument();
	});
});

describe("SpendMeter", () => {
	it("is a named meter with the spend and the budget, and changes colour over the budget", () => {
		const { container } = renderApp(
			<>
				<SpendMeter usd={2} budget={10} label="Under" />
				<SpendMeter usd={12} budget={10} label="Over" />
				<SpendMeter usd={3} budget={null} label="None" />
			</>,
		);
		const under = screen.getByRole("meter", { name: "Under" });
		expect(under).toHaveAttribute("aria-valuenow", "2");
		expect(under).toHaveAttribute("aria-valuemax", "10");
		expect(under.firstElementChild).toHaveClass("bg-accent");
		expect(under.firstElementChild).toHaveStyle({ width: "20%" });
		const over = screen.getByRole("meter", { name: "Over" });
		expect(over.firstElementChild).toHaveClass("bg-attention-strong");
		expect(over.firstElementChild).toHaveStyle({ width: "100%" });
		// No budget: no meter.
		expect(screen.queryByRole("meter", { name: "None" })).toBeNull();
		expect(container.querySelectorAll('[role="meter"]')).toHaveLength(2);
	});
});
