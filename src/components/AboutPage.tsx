import { useState } from 'react'
import { Tabs } from '../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import { OverviewPage } from './about/OverviewPage'
import { HowToPage } from './about/HowToPage'
import { ShelvesPage } from './about/ShelvesPage'
import { SmartShelvesPage } from './about/SmartShelvesPage'
import { FiltersPage } from './about/FiltersPage'
import { SortPage } from './about/SortPage'
import { OnlinePage } from './about/OnlinePage'
import { SupportPage } from './about/SupportPage'
import { FunnelIcon, SortIcon, SparkleIcon, InfoCircleIcon, OnlineIcon } from './icons'

// Decky's `Tab.title` is typed as `string` but the runtime renders any
// ReactNode. The cast lets us inline a leading icon next to the label
// for the tabs that benefit from a visual cue (filters/sort/smart/about);
// less-distinctive tabs keep plain text to avoid clutter.
function tabLabel(icon: React.ReactNode, text: string): string {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}
      {text}
    </span>
  ) as unknown as string
}

export function AboutPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('overview')
  return (
    <div style={{ position: 'relative', marginTop: 40, height: 'calc(100% - 40px)' }}>
      <Tabs
        activeTab={activeTab}
        onShowTab={setActiveTab}
        tabs={[
          { id: 'overview', title: t('docs_overview_title'), content: <OverviewPage /> },
          { id: 'howto', title: t('about_howto_title'), content: <HowToPage /> },
          { id: 'shelves', title: t('docs_shelves_title'), content: <ShelvesPage /> },
          { id: 'smart', title: tabLabel(<SparkleIcon />, t('docs_smart_shelves_title')), content: <SmartShelvesPage /> },
          { id: 'filters', title: tabLabel(<FunnelIcon />, t('docs_filters_title')), content: <FiltersPage /> },
          { id: 'sort', title: tabLabel(<SortIcon />, t('docs_sort_title')), content: <SortPage /> },
          { id: 'online', title: tabLabel(<OnlineIcon size={14} />, t('docs_online_title')), content: <OnlinePage /> },
          { id: 'support', title: tabLabel(<InfoCircleIcon />, t('about')), content: <SupportPage /> },
        ]}
      />
    </div>
  )
}
