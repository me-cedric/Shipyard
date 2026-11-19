import { useState } from "react";
import { SetupCard } from "@/features/settings/parts";
import { useI18n } from "@/lib/i18n";
import { commands, type FeedbackKind, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { Textarea } from "@/ui/atoms/textarea";
import { ErrorNotice } from "@/ui/molecules/error-notice";

const KINDS: FeedbackKind[] = ["bug", "idea"];

/**
 * Setup / Logs and feedback: open a prefilled issue of the Shipyard repository in the browser, or
 * a prefilled mail. The app sends nothing: the person submits it there.
 */
export function HealthFeedback() {
	const { t } = useI18n();
	const d = t.doctor.feedback;
	const [kind, setKind] = useState<FeedbackKind>("bug");
	const [title, setTitle] = useState("");
	const [details, setDetails] = useState("");
	const [error, setError] = useState<unknown>(null);
	const send = async (job: () => Promise<unknown>) => {
		setError(null);
		try {
			await job();
		} catch (e) {
			setError(e);
		}
	};
	return (
		<SetupCard id="doctor-feedback" title={d.title}>
			<div className="flex flex-col gap-3 px-6 pt-1.5 pb-4">
				<span className="inline-flex self-start">
					<Segmented
						label={d.kind}
						value={kind}
						onValueChange={setKind}
						items={KINDS.map((v) => ({ value: v, label: d[v] }))}
					/>
				</span>
				<Input
					label={d.subject}
					placeholder={d.subject}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
				/>
				<Textarea
					label={d.details}
					placeholder={d.details}
					rows={4}
					value={details}
					onChange={(e) => setDetails(e.target.value)}
				/>
				<div className="flex flex-wrap justify-end gap-2.5">
					<Button
						disabled={!title.trim()}
						onClick={() => void send(() => unwrap(commands.feedbackMail(title, details, true)))}
					>
						{t.extras.feedbackMail}
					</Button>
					<Button
						variant="primary"
						disabled={!title.trim()}
						onClick={() =>
							void send(() => unwrap(commands.feedbackOpen(kind, title, details, true)))
						}
					>
						{d.open}
					</Button>
				</div>
				{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
			</div>
		</SetupCard>
	);
}
