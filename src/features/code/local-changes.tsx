import { Link } from "@tanstack/react-router";
import { WithProject } from "@/features/shell/no-project";
import { useChanges } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { CodeBracketIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { PageHeader } from "@/ui/molecules/page-header";
import { useFilesTitle, WorkingCopy } from "./changes";
import { flatRows } from "./tree";

/** The page of an open project: the title counts the files to commit. */
function Page() {
	const { t } = useI18n();
	const changes = useChanges(true).data;
	const title = useFilesTitle(changes ? flatRows(changes).length : 0);
	return (
		<div className="flex flex-col">
			<PageHeader
				title={changes ? title : t.ui.place.code}
				back={
					<div className="pb-6">
						<BackLink
							label={t.ui.place.code}
							render={(props) => <Link to="/code/now" {...props} />}
						/>
					</div>
				}
			/>
			<div className="px-4 pt-3 pb-10">{changes ? <WorkingCopy changes={changes} /> : null}</div>
		</div>
	);
}

/** The local changes as a page of Code (`/code/changes`), with the way back to Code / Now. */
export function LocalChanges() {
	const { t } = useI18n();
	return (
		<WithProject title={t.ui.place.code} icon={<CodeBracketIcon size={16} />}>
			<Page />
		</WithProject>
	);
}
