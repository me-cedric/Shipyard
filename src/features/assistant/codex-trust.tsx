import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { AttentionCard } from "@/ui/molecules/attention-card";

/**
 * The Codex trust step. Codex treats a folder that is not in its
 * trusted list more strictly. One notice names the exact effect, and one click adds the folder.
 * Nothing is written before the click.
 */
export function CodexTrust({ card }: { card?: boolean } = {}): ReactNode {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	// Not now hides the card for this visit; the side panel keeps its notice.
	const [later, setLater] = useState(false);
	const q = useQuery({
		queryKey: ["codex", "trust"],
		queryFn: () => unwrap(commands.codexTrustState()),
		retry: false,
	});
	if (q.data !== false || (card && later)) return null;
	const trust = async () => {
		setError(null);
		try {
			await unwrap(commands.codexTrust(true));
			await qc.invalidateQueries({ queryKey: ["codex", "trust"] });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};
	const failure = error ? (
		<p role="alert" className="text-danger-text">
			{error}
		</p>
	) : null;
	if (card)
		return (
			<AttentionCard title={t.assistant.codexTrust.title}>
				{/* The card names what the click writes, behind a disclosure: nothing is written before it. */}
				<details className="text-13 text-n-11">
					<summary className="flex min-h-control cursor-pointer items-center font-semibold">
						{t.assistant.codexTrust.writes}
					</summary>
					<p>{t.assistant.codexTrust.body}</p>
				</details>
				<div className="flex gap-2.5">
					<Button className="flex-1 px-4" onClick={() => setLater(true)}>
						{t.assistant.codexTrust.notNow}
					</Button>
					<Button variant="primary" className="flex-1 px-4" onClick={() => void trust()}>
						{t.assistant.codexTrust.button}
					</Button>
				</div>
				{failure}
			</AttentionCard>
		);
	return (
		<div className="flex flex-col gap-1 rounded-md border border-warning bg-warning-subtle p-2 text-ui text-n-12">
			<p>{t.assistant.codexTrust.body}</p>
			<Button className="self-start" onClick={() => void trust()}>
				{t.assistant.codexTrust.button}
			</Button>
			{failure}
		</div>
	);
}
