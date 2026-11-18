import { Link } from "@tanstack/react-router";
import { WithProject } from "@/features/shell/no-project";
import { useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { CodeBracketIcon, FolderOpenIcon, ShieldCheckIcon } from "@/ui/icons";
import { Door } from "@/ui/molecules/door";
import { PageHeader } from "@/ui/molecules/page-header";
import { WorkingCopy } from "./changes";
import { PullList } from "./pull-requests";

/**
 * Code / Now (`spec:app-redesign#REQ-022`, adr:0023): the files to commit with the commit box, the
 * pull requests, and the doors to the product health and to the files of the project.
 */
export function CodeNow() {
	const { t } = useI18n();
	const { setFilesOpen } = useShell();
	const icon = <CodeBracketIcon size={16} />;
	return (
		<WithProject title={t.ui.place.code} icon={icon}>
			<div className="flex flex-col">
				<PageHeader icon={icon} title={t.ui.place.code} />
				<div className="flex flex-col gap-6 px-4 pt-3 pb-4">
					<WorkingCopy />
					<PullList />
					<div className="grid gap-3 sm:grid-cols-2">
						<Door
							label={t.forge.now.health}
							icon={<ShieldCheckIcon size={20} />}
							render={(props) => <Link to="/flow/health" {...props} />}
						/>
						<Door
							label={t.forge.files}
							icon={<FolderOpenIcon size={20} />}
							onClick={() => setFilesOpen(true)}
						/>
					</div>
				</div>
			</div>
		</WithProject>
	);
}
