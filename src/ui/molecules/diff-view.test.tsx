import { screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { DiffView } from "./diff-view";

const PATCH = "@@ -1,1 +1,1 @@\n-let a = 1\n+const a = 2";

describe("DiffView colours", () => {
	it("colours the code of a changed line by the file type", () => {
		renderApp(
			<DiffView text={PATCH} path="src/a.ts" label="Diff" binaryLabel="" truncatedLabel="" />,
		);
		expect(screen.getByText("const")).toHaveClass("text-accent-text");
	});

	it("keeps the text plain without a known type", () => {
		renderApp(<DiffView text={PATCH} path="a.md" label="Diff" binaryLabel="" truncatedLabel="" />);
		expect(screen.queryByText("const")).toBeNull();
		expect(screen.getByText("const a = 2")).toBeInTheDocument();
	});
});
