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
	it("offers the one next step of an item, and none for a ref with no step", async () => {
		await withTracker();
		const { unmount } = renderApp(detail("change:add-auth"));
		expect(
			await screen.findByRole("button", { name: "Split into work items" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Create work item" })).toBeNull();
		unmount();
		renderApp(detail("test:auth-login"));
		await screen.findByText("Login");
		expect(screen.queryByRole("button", { name: /Write plan|Split into work items/ })).toBeNull();
	});
});
