import { TEMPLATE } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { QueueListIcon } from "@/ui/icons";
import { DbmlView } from "@/ui/organisms/dbml-view";
import { TextTab } from "./text-tab";

/** Design / Data: the DBML models as tables and relations (REQ-014, REQ-015). */
export function Data() {
	const { t } = useI18n();
	return (
		<TextTab
			kind="data"
			title={t.tabs.design.data}
			icon={<QueueListIcon size={16} />}
			noun={t.design.noun.data}
			ext="dbml"
			template={TEMPLATE.data}
			textLabel={t.design.data.text}
			view={(source, onError) => (
				<DbmlView source={source} labels={t.design.data} onError={onError} />
			)}
		/>
	);
}
