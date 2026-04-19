import { useState } from 'react'
import { Tabs } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import { OverviewPage } from './about/OverviewPage'
import { HowToPage } from './about/HowToPage'
import { ShelvesPage } from './about/ShelvesPage'
import { FiltersPage } from './about/FiltersPage'
import { SupportPage } from './about/SupportPage'

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
          { id: 'filters', title: t('docs_filters_title'), content: <FiltersPage /> },
          { id: 'support', title: t('about'), content: <SupportPage /> },
        ]}
      />
    </div>
  )
}
