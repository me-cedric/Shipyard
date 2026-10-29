import { useState } from "react";
import { Button } from "../atoms/button";
import { StatusDot } from "../atoms/status-dot";
import { BacklinkList } from "../molecules/backlink-list";
import { CodeEditor } from "../molecules/code-editor";
import { EmptyState } from "../molecules/empty-state";
import { FindingRow } from "../molecules/finding-row";
import { RefChip } from "../molecules/ref-chip";
import { ApplyDialog } from "../organisms/apply-dialog";
import { EditorFrame } from "../organisms/editor-frame";

// The demo texts are English literals: the gallery is a developer page, not a product screen.
const FEATURE =
	"Feature: Login\n\n  @spec:auth#REQ-001\n  Scenario: A session starts\n    Given a person\n    Then it works\n    it has no keyword";
const FRAME = {
	copy: "Copy ref",
	dirty: "Unsaved changes",
	conflict: "The file changed on disk.",
	reload: "Reload",
	keepMine: "Keep mine",
	line: "Line",
};

/** The parts that the Specs views use: the Gherkin frame, the findings, the backlinks, the split apply. */
export function SpecsParts() {
	const [apply, setApply] = useState(false);
	return (
		<>
			<div className="flex flex-col gap-2 border-b py-3">
				<EditorFrame
					title="Login"
					refId="test:login"
					save="conflict"
					error={{ message: "expected a step keyword", line: 7 }}
					primary={{ label: "Save", onClick: () => {} }}
					labels={FRAME}
				>
					<CodeEditor label="Login" value={FEATURE} errorLine={7} />
				</EditorFrame>
			</div>
			<div className="flex flex-col gap-2 border-b py-3">
				<FindingRow
					status="danger"
					title="REQ-002 has no scenario"
					source={<RefChip refId="spec:auth#REQ-002" state="resolved" />}
					action={{ label: "Open", onClick: () => {} }}
				/>
				<div className="flex items-center gap-2">
					<StatusDot status="idle" label="Missing" />
					<StatusDot status="warning" label="Draft" />
					<StatusDot status="success" label="Done" />
					<RefChip refId="spec:auth#REQ-009" state="broken" />
				</div>
				<BacklinkList
					groups={[
						{ kind: "test", items: [{ ref: "test:login", title: "Login" }] },
						{ kind: "wi", items: [{ ref: "wi:ACME-1", title: "Sign in" }] },
					]}
					onOpen={() => {}}
				/>
			</div>
			<div className="flex flex-col gap-2 border-b py-3">
				<Button onClick={() => setApply(true)}>Apply split</Button>
				{apply ? (
					<ApplyDialog
						open
						onOpenChange={setApply}
						title="Apply split"
						rows={[
							{
								reference: "est:add-auth#sessions",
								kind: "epic",
								title: "sessions",
								action: "create",
								changes: [],
							},
							{
								reference: "est:add-auth#sessions-req-001",
								kind: "story",
								title: "Refresh a token",
								action: "create",
								changes: [],
							},
						]}
						onApply={() => {}}
					/>
				) : null}
			</div>
			<div className="border-b py-3">
				<EmptyState action={{ label: "New change", onClick: () => {} }} />
			</div>
		</>
	);
}
