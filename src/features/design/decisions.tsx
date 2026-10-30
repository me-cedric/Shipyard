import { useState } from "react";
import { type Adr, useDesignActions, useDesignList } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { DocumentTextIcon } from "@/ui/icons";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { DesignAdrDecision } from "@/ui/organisms/design-adr-decision";
import { DocForm } from "@/ui/organisms/doc-form";
import { FileFrame } from "./frame";
import { ArtifactTab } from "./tab";

const TONE: Record<string, "success" | "warning" | "danger"> = {
	accepted: "success",
	proposed: "warning",
	rejected: "danger",
};

/** The MADR status values of the picker. */
const STATUSES = ["proposed", "accepted", "rejected", "deprecated", "superseded"];

function Decision({ adr }: { adr: Adr }) {
	const { t } = useI18n();
	const d = t.design.decisions;
	const e = t.editing;
	const [view, setView] = useState<"form" | "text">("form");
	return (
		<FileFrame
			path={adr.path}
			refId={`adr:${adr.number}`}
			title={adr.title}
			actions={
				<ViewTabs
					label={e.view.label}
					value={view}
					onValueChange={setView}
					tabs={[
						{ value: "form", label: e.view.form },
						{ value: "text", label: e.view.text },
					]}
				/>
			}
		>
			{(file) => (
				<div className="flex flex-col gap-3">
					{view === "form" ? (
						<DocForm
							text={file.text}
							onChange={file.setText}
							statuses={STATUSES}
							statusLabel={{ ...e.adrStatus, ...d.status }}
							labels={{ ...e.field, form: d.text }}
						/>
					) : (
						<CodeEditor label={d.text} value={file.text} onChange={file.setText} />
					)}
					{adr.status === "proposed" ? (
						<DesignAdrDecision
							// A change that is not saved would be lost: save it first.
							busy={file.dirty}
							labels={{ ...d, required: d.needComment }}
							onAccept={(c) =>
								void file.commit(async (s) =>
									unwrap(commands.designAdrDecide(adr.path, "accept", c, s ?? "")),
								)
							}
							onReject={(c) =>
								void file.commit(async (s) =>
									unwrap(commands.designAdrDecide(adr.path, "reject", c, s ?? "")),
								)
							}
						/>
					) : null}
				</div>
			)}
		</FileFrame>
	);
}

/** Design / Decisions: the ADRs with number, title and status (REQ-008 to REQ-010). */
export function Decisions() {
	const { t } = useI18n();
	const list = useDesignList().data;
	const act = useDesignActions();
	const adrs = list?.adrs ?? [];
	return (
		<ArtifactTab
			title={t.tabs.design.decisions}
			icon={<DocumentTextIcon size={16} />}
			noun={t.design.noun.adr}
			form="adr"
			timeline
			rows={adrs.map((a) => ({
				ref: `adr:${a.number}`,
				lead: a.number,
				title: a.title,
				tag: t.design.decisions.status[a.status] ?? a.status,
				tone: TONE[a.status] ?? "neutral",
				time: a.date || undefined,
				path: a.path,
			}))}
			create={{ run: async (title) => `adr:${(await act.createAdr(title)).number}` }}
		>
			{(row) => {
				const adr = adrs.find((a) => `adr:${a.number}` === row.ref);
				return adr ? <Decision adr={adr} /> : null;
			}}
		</ArtifactTab>
	);
}
