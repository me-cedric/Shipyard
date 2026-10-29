import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AskedQuestion_Serialize } from "@/lib/ipc";
import { renderApp } from "../test-utils";
import { EmptyState } from "./empty-state";
import { GroupSection } from "./group-section";
import { QuestionCard } from "./question-card";
import { RefChip } from "./ref-chip";

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
	it("shows ghost rows and one primary action, and no sentence", async () => {
		const onClick = vi.fn();
		const { container } = renderApp(<EmptyState action={{ label: "Create", onClick }} />);
		expect(container.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(5);
		expect(screen.getAllByRole("button")).toHaveLength(1);
		expect(container.querySelector("p")).toBeNull();
		await userEvent.click(screen.getByRole("button", { name: "Create" }));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("keeps the ghost rows still", () => {
		const { container } = renderApp(<EmptyState action={{ label: "Create", onClick: () => {} }} />);
		expect(container.innerHTML).not.toMatch(/animate-/);
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
