import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useI18n } from "@/lib/i18n";
import { commands, type RunnerTiers, unwrap } from "@/lib/ipc";
import { Caption, Input } from "@/ui/atoms/input";
import { GroupSection } from "@/ui/molecules/group-section";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { Compass } from "./extensions/compass";

const TIERS = ["top", "mid", "small"] as const;
const tiersKey = ["tiers"] as const;

/** One runner: a field for each tier. A field saves when it loses focus. */
function TierRow({ row }: { row: RunnerTiers }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const [draft, setDraft] = useState(row);
	const save = (next: RunnerTiers) =>
		run(async () => {
			qc.setQueryData(tiersKey, await unwrap(commands.tiersSet(next)));
		});
	return (
		<>
			<SettingsRow label={row.runner}>
				{TIERS.map((tier) => (
					<Caption key={tier} label={t.settings.tiers[tier]}>
						<Input
							label={`${row.runner} ${t.settings.tiers[tier]}`}
							className="w-40"
							value={draft[tier]}
							onChange={(e) => setDraft({ ...draft, [tier]: e.target.value })}
							onBlur={() => draft[tier] !== row[tier] && void save(draft)}
						/>
					</Caption>
				))}
			</SettingsRow>
			{error ? (
				<p role="alert" className="px-3 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}

/** Settings / Agents and rules: the compass part, then the model of each tier of each runner (factory REQ-012). */
export function AgentsRules() {
	const { t } = useI18n();
	const tiers = useQuery({ queryKey: tiersKey, queryFn: () => unwrap(commands.tiersGet()) });
	return (
		<Compass>
			<GroupSection name={t.settings.tiers.name} count={tiers.data?.length ?? 0}>
				{(tiers.data ?? []).map((row) => (
					// The saved row keys the draft: a refused edit keeps the typed text until the person fixes it.
					<TierRow key={row.runner} row={row} />
				))}
			</GroupSection>
		</Compass>
	);
}
