import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/ui/test-utils";
import { NotificationCentre } from "./notification-centre";

const base = { kind: "info" as const, time: 0, read: true };

describe("NotificationCentre", () => {
	it("opens the target of a row and closes, shows the whole body, folds the detail, runs the action", async () => {
		const user = userEvent.setup();
		const onGo = vi.fn();
		const run = vi.fn();
		const body = "a long body ".repeat(20).trim();
		renderApp(
			<NotificationCentre
				items={[
					{
						...base,
						id: "a",
						title: "Sync failed",
						body,
						detail: "stack line\n".repeat(5),
						target: { route: "/code/branches" },
						action: { label: "Retry", run },
					},
				]}
				unread={0}
				onOpen={() => {}}
				onClear={() => {}}
				onGo={onGo}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Notifications" }));
		expect(screen.getByText(body)).not.toHaveClass("truncate");
		await user.click(screen.getByRole("button", { name: "Details" }));
		expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
		await user.click(screen.getByRole("button", { name: "Retry" }));
		expect(run).toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: /Sync failed/ }));
		expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("names each row and shows the buttons of an approval", async () => {
		const user = userEvent.setup();
		const approve = vi.fn();
		renderApp(
			<NotificationCentre
				items={[
					{
						...base,
						id: "approval:1",
						title: "ACME-1: approval",
						body: "Move ACME-1 to In Progress",
						target: { ref: "run:r1" },
						actions: [{ label: "Approve", run: approve }],
					},
				]}
				unread={0}
				onOpen={() => {}}
				onClear={() => {}}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Notifications" }));
		const row = screen.getByRole("article", {
			name: "ACME-1: approval: Move ACME-1 to In Progress",
		});
		await user.click(within(row).getByRole("button", { name: "Approve" }));
		expect(approve).toHaveBeenCalled();
	});

	it("dismisses one row", async () => {
		const user = userEvent.setup();
		const onRemove = vi.fn();
		renderApp(
			<NotificationCentre
				items={[
					{ ...base, id: "a", title: "First" },
					{ ...base, id: "b", title: "Second" },
				]}
				unread={0}
				onOpen={() => {}}
				onClear={() => {}}
				onRemove={onRemove}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Notifications" }));
		const row = screen.getByRole("article", { name: "Second" });
		await user.click(within(row).getByRole("button", { name: "Dismiss" }));
		expect(onRemove).toHaveBeenCalledWith("b");
	});
});
