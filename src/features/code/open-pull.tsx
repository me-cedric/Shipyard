import { useState } from "react";
import { useForgeActions, usePullLabels } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Textarea } from "@/ui/atoms/textarea";
import { CheckIcon, PlusIcon, SparklesIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Dialog } from "@/ui/organisms/dialog";
import { useRun } from "./use-run";

/** The form of REQ-020: a title, a description, a base, a draft option and labels that exist. */
export function OpenDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
}) {
	const { t } = useI18n();
	const { open: openPull } = useForgeActions();
	const known = usePullLabels().data ?? [];
	const { failure, run } = useRun();
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [base, setBase] = useState("");
	const [draft, setDraft] = useState(false);
	const [labels, setLabels] = useState<string[]>([]);
	const [missing, setMissing] = useState<string[]>([]);
	const [labelError, setLabelError] = useState<string | null>(null);
	// The pull request exists once the call returns: a second click would open a duplicate.
	const [created, setCreated] = useState(false);
	const [writing, setWriting] = useState(false);
	// The agent fills the title and the body. The person edits them, then clicks Open.
	const write = () =>
		void run(async () => {
			setWriting(true);
			try {
				const text = await unwrap(commands.prWriteText(base.trim() || null, true));
				setTitle(text.title);
				setBody(text.body);
			} finally {
				setWriting(false);
			}
		});
	const submit = () =>
		void run(async () => {
			const out = await openPull({ title, body, base: base.trim() || null, draft, labels });
			setCreated(true);
			setMissing(out.missingLabels);
			setLabelError(out.labelError);
			if (out.missingLabels.length === 0 && !out.labelError) onOpenChange(false);
		});
	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={t.forge.openPull}
			actions={
				<RightButton right="code.write" variant="primary" onClick={submit} disabled={created}>
					<PlusIcon size={14} />
					{t.forge.openPull}
				</RightButton>
			}
		>
			<div>
				<Button disabled={writing || created} onClick={write}>
					<SparklesIcon size={14} />
					{writing ? t.forge.agent.writing : t.forge.agent.write}
				</Button>
			</div>
			<Input label={t.forge.title} value={title} onChange={(e) => setTitle(e.target.value)} />
			<Textarea
				label={t.forge.description}
				value={body}
				onChange={(e) => setBody(e.target.value)}
			/>
			<Input label={t.forge.base} value={base} onChange={(e) => setBase(e.target.value)} />
			<section aria-label={t.forge.labels} className="flex items-center gap-1">
				{known.map((l) => (
					<Button
						key={l}
						variant={labels.includes(l) ? "secondary" : "ghost"}
						aria-pressed={labels.includes(l)}
						onClick={() =>
							setLabels((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]))
						}
					>
						{labels.includes(l) ? <CheckIcon size={12} /> : null}
						{l}
					</Button>
				))}
			</section>
			<Button
				variant={draft ? "secondary" : "ghost"}
				aria-pressed={draft}
				onClick={() => setDraft(!draft)}
			>
				{t.forge.draft}
			</Button>
			{missing.length ? (
				<p role="status" className="text-ui text-warning-text">
					{format(t.forge.missingLabels, { names: missing.join(", ") })}
				</p>
			) : null}
			<ErrorNotice error={failure ?? labelError} className="px-3 py-2" />
		</Dialog>
	);
}
