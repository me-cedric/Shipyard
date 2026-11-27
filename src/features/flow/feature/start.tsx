import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { hiddenSection } from "@/features/shell/places";
import { NameDialog } from "@/features/specs/name-dialog";
import { useGuard } from "@/features/work/guard";
import { useRunActions } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useSpecsActions } from "@/lib/specs";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import type { Parts } from "./use-feature";

export const keyOf = (ref?: string) => ref?.replace(/^wi:/, "");

/** "Start an agent": a ticket starts a run of its own; a feature with no ticket goes to the new feature page. */
export function StartAgent({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const act = useRunActions();
	const { openRef } = useShell();
	const { failure, run: guard } = useGuard();
	const key = keyOf(parts.ticket);
	// A feature with no ticket starts at `/flow/new`, which shows with the List.
	const noList = hiddenSection(useRights().level, "flow", "list");
	if (!key && noList) return null;
	return (
		<>
			<RightButton
				right="runs.start"
				className="min-h-control"
				variant="primary"
				onClick={() =>
					key
						? void guard(async () => openRef(`run:${await act.start(key)}`))
						: void navigate({ to: "/flow/new" })
				}
			>
				{t.flow.feature.startAgent}
			</RightButton>
			<ErrorNotice error={failure} />
		</>
	);
}

/** "Write the spec": a change from the ticket, or the new change of Specs when the feature has no ticket. */
export function WriteSpec({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const navigate = useNavigate();
	const act = useSpecsActions();
	const { failure, run: guard } = useGuard();
	const [naming, setNaming] = useState(false);
	const key = keyOf(parts.ticket);
	const done = async () => {
		await qc.invalidateQueries({ queryKey: ["features"] });
	};
	return (
		<>
			<RightButton
				right="specs.edit"
				className="min-h-control"
				variant="primary"
				onClick={() =>
					key
						? void guard(async () => {
								await act.changeFromTicket(key);
								await done();
							})
						: setNaming(true)
				}
			>
				{t.flow.feature.writeSpec}
			</RightButton>
			<ErrorNotice error={failure} />
			{naming ? (
				<NameDialog
					title={t.specs.newChange}
					label={t.specs.changeId}
					onCreate={async (id) => {
						const c = await act.createChange(id);
						await done();
						void navigate({
							to: "/flow/feature/$featureId",
							params: { featureId: `change:${c.id}` },
							search: { section: "brief" },
						});
					}}
					onClose={() => setNaming(false)}
				/>
			) : null}
		</>
	);
}
