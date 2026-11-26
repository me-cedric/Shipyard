import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
		const user = userEvent.setup();
		const { unmount } = renderApp(detail("change:add-auth"));
		await user.click(await screen.findByRole("button", { name: "More" }));
		expect(await screen.findByRole("button", { name: "Split into tickets" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Create a ticket" })).toBeNull();
		unmount();
		renderApp(detail("test:auth-login"));
		await screen.findByText("Login");
		await user.click(screen.getByRole("button", { name: "More" }));
		expect(screen.queryByRole("button", { name: /Write plan|Split into tickets/ })).toBeNull();
	});
});
