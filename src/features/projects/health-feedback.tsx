import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, type FeedbackKind, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { ChatBubbleIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";

const KINDS: FeedbackKind[] = ["bug", "idea"];

/**
 * Settings / Health: open a prefilled issue of the Shipyard repository in the browser. The app
 * sends nothing: the person submits it there.
 */
export function HealthFeedback() {
	const { t } = useI18n();
	const d = t.doctor.feedback;
	const [kind, setKind] = useState<FeedbackKind>("bug");
	const [title, setTitle] = useState("");
	const [details, setDetails] = useState("");
	const [error, setError] = useState<string | null>(null);
	const open = async () => {
		setError(null);
		try {
			await unwrap(commands.feedbackOpen(kind, title, details, true));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};
	return (
		<Panel title={d.title} icon={<ChatBubbleIcon size={14} />}>
			<div className="flex flex-col gap-2 p-3">
				<div className="flex gap-2">
					<Select
						label={d.kind}
						value={kind}
						items={KINDS.map((v) => ({ value: v, label: d[v] }))}
						onValueChange={(v) => setKind(v as FeedbackKind)}
					/>
					<Input label={d.subject} value={title} onChange={(e) => setTitle(e.target.value)} />
				</div>
				<Textarea
					label={d.details}
					rows={3}
					value={details}
					onChange={(e) => setDetails(e.target.value)}
				/>
				<div>
					<Button variant="primary" disabled={!title.trim()} onClick={() => void open()}>
						{d.open}
					</Button>
				</div>
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}
			</div>
		</Panel>
	);
}
