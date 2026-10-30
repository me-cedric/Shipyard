import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Dialog } from "@/ui/organisms/dialog";

type Props = { done: (note: string) => void; close: () => void };

/** The shell of a form: fields, the one Export button and the error with its action. */
function Form({
	title,
	ready,
	run,
	close,
	children,
}: {
	title: string;
	ready: boolean;
	run: () => Promise<string>;
	close: () => void;
	children: React.ReactNode;
}) {
	const { t } = useI18n();
	const [failure, setFailure] = useState<unknown>(null);
	return (
		<Dialog
			open
			onOpenChange={(o) => !o && close()}
			title={title}
			actions={
				<Button
					variant="primary"
					disabled={!ready}
					onClick={() => {
						setFailure(null);
						void run().then(close).catch(setFailure);
					}}
				>
					{t.reports.export}
				</Button>
			}
		>
			{children}
			<ErrorNotice error={failure} />
		</Dialog>
	);
}

/** `CR-003`: a title, the two refs and the approvers. It writes the files in the project. */
export function ChangeRequestForm({ done, close }: Props) {
	const { t } = useI18n();
	const f = t.reports.form;
	const [title, setTitle] = useState("");
	const [base, setBase] = useState("main");
	const [head, setHead] = useState("HEAD");
	const [approvers, setApprovers] = useState("");
	return (
		<Form
			title={t.reports.changeRequest}
			ready={Boolean(title.trim() && base.trim() && head.trim())}
			close={close}
			run={async () => {
				const names = approvers
					.split(",")
					.map((a) => a.trim())
					.filter(Boolean);
				const out = await unwrap(
					commands.exportChangeRequestFiles(title, base.trim(), head.trim(), names, true),
				);
				done(format(t.reports.changeRequestDone, out));
				return out.id;
			}}
		>
			<Input caption label={f.title} value={title} onChange={(e) => setTitle(e.target.value)} />
			<Input caption label={f.base} value={base} onChange={(e) => setBase(e.target.value)} />
			<Input caption label={f.head} value={head} onChange={(e) => setHead(e.target.value)} />
			<Input
				caption
				label={f.approvers}
				value={approvers}
				onChange={(e) => setApprovers(e.target.value)}
			/>
		</Form>
	);
}

const day = (back: number) => new Date(Date.now() - back * 864e5).toISOString().slice(0, 10);

/** The work done between two refs for a period. The save dialog comes after the form. */
export function WorkDoneForm({
	done,
	close,
	pick,
}: Props & { pick: () => Promise<string | null> }) {
	const { t } = useI18n();
	const f = t.reports.form;
	const [base, setBase] = useState("main");
	const [head, setHead] = useState("HEAD");
	const [from, setFrom] = useState(day(30));
	const [to, setTo] = useState(day(0));
	return (
		<Form
			title={t.reports.workDone}
			ready={Boolean(base.trim() && head.trim() && from && to)}
			close={close}
			run={async () => {
				const path = await pick();
				if (!path) return "";
				const text = {
					title: t.reports.workDone,
					...t.reports.text,
					sections: [],
				};
				await unwrap(
					commands.exportWorkDoneFile(text, base.trim(), head.trim(), from, to, path, true),
				);
				done(format(t.reports.exported, { path }));
				return path;
			}}
		>
			<Input caption label={f.base} value={base} onChange={(e) => setBase(e.target.value)} />
			<Input caption label={f.head} value={head} onChange={(e) => setHead(e.target.value)} />
			<Input
				caption
				type="date"
				label={f.from}
				value={from}
				onChange={(e) => setFrom(e.target.value)}
			/>
			<Input caption type="date" label={f.to} value={to} onChange={(e) => setTo(e.target.value)} />
		</Form>
	);
}
