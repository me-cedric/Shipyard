import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AskedQuestion_Serialize } from "@/lib/ipc";
import { QuestionCard } from "@/ui/molecules/question-card";
import { renderApp } from "@/ui/test-utils";

const base: AskedQuestion_Serialize = {
	id: "Q-101",
	question: "Where should the user land?",
	options: ["The login page", "The home page", "Both"],
	recommended: 2,
	free_text: false,
	spec: null,
	state: "open",
	answer: null,
	unclear: null,
	edited: false,
};

describe("QuestionCard", () => {
	it("marks the recommended option and sends it with Enter (REQ-008)", async () => {
		const user = userEvent.setup();
		const onAnswer = vi.fn();
		renderApp(<QuestionCard question={base} onAnswer={onAnswer} />);
		const second = screen.getByRole("radio", { name: /The home page/ });
		expect(screen.getByRole("img", { name: "Recommended" }).closest("label")).toContainElement(
			second,
		);
		expect(second).toBeChecked();
		await user.tab();
		await user.keyboard("{Enter}");
		expect(onAnswer).toHaveBeenCalledWith({ kind: "option", n: 2 });
	});

	it("picks an option with a digit and ignores a digit out of range", async () => {
		const user = userEvent.setup();
		const onAnswer = vi.fn();
		renderApp(<QuestionCard question={base} onAnswer={onAnswer} />);
		await user.tab();
		await user.keyboard("3{Enter}");
		expect(onAnswer).toHaveBeenLastCalledWith({ kind: "option", n: 3 });
		await user.keyboard("9{Enter}");
		expect(onAnswer).toHaveBeenLastCalledWith({ kind: "option", n: 3 });
	});

	it("sends the free text, and a digit in the field is text", async () => {
		const user = userEvent.setup();
		const onAnswer = vi.fn();
		renderApp(<QuestionCard question={{ ...base, free_text: true }} onAnswer={onAnswer} />);
		await user.type(screen.getByRole("textbox", { name: "Your answer" }), "CSV 1{Enter}");
		expect(onAnswer).toHaveBeenCalledWith({ kind: "text", text: "CSV 1" });
	});

	it("shows an unclear reply on the card and takes the decision there (REQ-011)", async () => {
		const user = userEvent.setup();
		const onAnswer = vi.fn();
		renderApp(
			<QuestionCard question={{ ...base, unclear: "maybe the home page?" }} onAnswer={onAnswer} />,
		);
		expect(screen.getByRole("note", { name: "Reply to decide" })).toHaveTextContent(
			"maybe the home page?",
		);
		await user.click(screen.getByRole("radio", { name: /Both/ }));
		await user.click(screen.getByRole("button", { name: "Send" }));
		expect(onAnswer).toHaveBeenCalledWith({ kind: "option", n: 3 });
	});

	it("shows the answer and the fold preview of a spec question (REQ-015, REQ-020)", async () => {
		const user = userEvent.setup();
		const onFold = vi.fn();
		const answered: AskedQuestion_Serialize = {
			...base,
			state: "answered",
			spec: "spec:export#REQ-001",
			answer: { choice: { kind: "option", n: 1 }, source: { kind: "inbox" }, text: "" },
		};
		renderApp(
			<QuestionCard
				question={answered}
				onAnswer={vi.fn()}
				fold={{
					lines: ["- line 3: [NEEDS CLARIFICATION: Q-101 x]", "+ ### Clarifications"],
					onFold,
				}}
			/>,
		);
		expect(screen.getByText("Answered")).toBeInTheDocument();
		expect(screen.queryByRole("radio")).toBeNull();
		expect(
			within(screen.getByRole("group", { name: "Preview" })).getAllByText(/NEEDS|Clarifications/),
		).toHaveLength(2);
		await user.click(screen.getByRole("button", { name: "Fold" }));
		expect(onFold).toHaveBeenCalledOnce();
	});
});
