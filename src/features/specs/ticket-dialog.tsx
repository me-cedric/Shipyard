import { useState } from "react";
import { useWorkflows } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { type Change, type TicketChange, useSpecsActions } from "@/lib/specs";
import { useWorkItems } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Dialog } from "@/ui/organisms/dialog";
import { useGuard } from "./guard";

/**
 * A change that starts from an issue tracker item. "Create" makes the change on the branch
 * `specs/<id>`, with the ticket text in the proposal. Then "Delegate to an agent" labels the ticket
 * so the factory claims it.
 */
export function TicketDialog({
	onOpen,
	onClose,
}: {
	onOpen: (change: Change) => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const act = useSpecsActions();
	const items = useWorkItems({}).data ?? [];
	const workflows = useWorkflows().data ?? [];
	const [key, setKey] = useState("");
	const [made, setMade] = useState<TicketChange | null>(null);
	const [workflow, setWorkflow] = useState("");
	const [sent, setSent] = useState<string | null>(null);
	const { failure, run } = useGuard();
	const chosen = workflow || workflows[0]?.id || "";
	return (
		<Dialog
			open
			onOpenChange={(o) => !o && onClose()}
			title={t.specs.fromTicket}
			actions={
				made ? (
					<Button
						variant="primary"
						disabled={!chosen || sent !== null}
						onClick={() => void run(async () => setSent(await act.delegate(key, chosen)))}
					>
						{t.specs.delegate}
					</Button>
				) : (
					<Button
						variant="primary"
						disabled={!key}
						onClick={() => void run(async () => setMade(await act.changeFromTicket(key)))}
					>
						{t.specs.create}
					</Button>
				)
			}
		>
			<Select
				label={t.specs.ticket}
				value={key}
				disabled={made !== null}
				onValueChange={setKey}
				items={items.map((i) => ({ value: i.key, label: `${i.key} ${i.title}` }))}
			/>
			{made ? (
				<>
					<p role="status" className="font-mono text-ui">
						{format(t.specs.branch, { name: made.branch })}
					</p>
					<Select
						label={t.specs.workflow}
						value={chosen}
						onValueChange={setWorkflow}
						items={workflows.map((w) => ({ value: w.id, label: w.id }))}
					/>
					{sent ? <p role="status">{format(t.specs.delegated, { label: sent })}</p> : null}
					<Button variant="ghost" onClick={() => onOpen(made.change)}>
						{made.change.title}
					</Button>
				</>
			) : null}
			<ErrorNotice error={failure} />
		</Dialog>
	);
}
