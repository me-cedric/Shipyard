import { useEffect, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type DiffRow, type FactorySend, unwrap, type WorkflowItem } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { ArrowUpTrayIcon } from "@/ui/icons";
import { Dialog } from "@/ui/organisms/dialog";
import type { Assistant } from "./use-assistant";

const NONE = "none";

/**
 * Send to factory. The dialog shows the work item first and creates it only on Send. A workflow
 * adds the `wf:` label, and the factory starts the run after pickup (REQ-014, REQ-015).
 */
export function SendToFactory({ a }: { a: Assistant }) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const [preview, setPreview] = useState<DiffRow | null>(null);
	const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
	const [workflow, setWorkflow] = useState(NONE);
	const [sent, setSent] = useState<FactorySend | null>(null);
	const [error, setError] = useState<string | null>(null);
	const id = a.current?.thread.id;
	const empty = !a.current?.thread.messages.length;

	useEffect(() => {
		if (!open || !id) return;
		setSent(null);
		setError(null);
		setWorkflow(NONE);
		Promise.all([
			unwrap(commands.assistantToFactoryPreview(id)),
			unwrap(commands.workflowsList()).catch(() => []),
		])
			.then(([row, list]) => {
				setPreview(row);
				setWorkflows(list.filter((w) => !w.issue));
			})
			.catch((e) => setError(e instanceof Error ? e.message : String(e)));
	}, [open, id]);

	const send = () => {
		if (!id) return;
		unwrap(commands.assistantToFactory(id, workflow === NONE ? null : workflow, true))
			.then(setSent)
			.catch((e) => setError(e instanceof Error ? e.message : String(e)));
	};
	return (
		<>
			<Button variant="ghost" disabled={empty || a.busy} onClick={() => setOpen(true)}>
				<ArrowUpTrayIcon size={14} />
				{t.assistant.factory.send}
			</Button>
			<Dialog
				open={open}
				onOpenChange={setOpen}
				title={t.assistant.factory.send}
				actions={
					sent || !preview ? null : (
						<Button variant="primary" onClick={send}>
							<ArrowUpTrayIcon size={14} />
							{t.assistant.factory.create}
						</Button>
					)
				}
			>
				{preview ? (
					<div className="flex flex-col gap-2">
						<p className="truncate text-ui font-medium">{preview.row.title}</p>
						<p className="font-mono text-12 text-n-11">{preview.row.reference}</p>
						<Select
							caption
							label={t.assistant.factory.workflow}
							value={workflow}
							disabled={sent !== null}
							items={[
								{ value: NONE, label: t.assistant.factory.none },
								...workflows.map((w) => ({ value: w.id, label: w.id })),
							]}
							onValueChange={setWorkflow}
						/>
					</div>
				) : null}
				{sent ? (
					<p role="status" className="text-ui">
						{format(t.assistant.factory.sent, { key: sent.item.key ?? sent.item.reference })}
						{sent.label ? ` · ${sent.label}` : ""}
					</p>
				) : null}
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}
			</Dialog>
		</>
	);
}
