import { screen } from "@testing-library/react";
import { RefDetail } from "@/features/shell/ref-detail";
import { ShellProvider } from "@/lib/shell";
import { withTracker } from "@/test/tracker";
import { renderApp } from "@/ui/test-utils";
import { refActions } from "./ref-actions";

const detail = (refId: string) => (
	<ShellProvider refActions={refActions}>
		<RefDetail refId={refId} onOpen={() => {}} />
	</ShellProvider>
);

describe("the inspector actions of a ref", () => {
	it("is offered in the inspector for a ref that can become an item, and only with a tracker", async () => {
		await withTracker();
		const { unmount } = renderApp(detail("change:add-auth"));
		expect(await screen.findByRole("button", { name: "Create work item" })).toBeInTheDocument();
		unmount();
		renderApp(detail("test:auth-login"));
		await screen.findByText("Login");
		expect(screen.queryByRole("button", { name: "Create work item" })).toBeNull();
	});
});
