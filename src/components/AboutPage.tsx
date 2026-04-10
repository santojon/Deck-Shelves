import React from 'react'
import { Focusable, SidebarNavigation } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import { OverviewPage } from './about/OverviewPage'
import { HowToPage } from './about/HowToPage'
import { ShelvesPage } from './about/ShelvesPage'
import { FiltersPage } from './about/FiltersPage'
import { SupportPage } from './about/SupportPage'

const bookPageIcon = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <path d="M4 2h9l4 4v12H4V2z" fill="currentColor" opacity="0.15" />
    <path d="M4 2h9l4 4v12H4V2z" />
    <path d="M13 2v4h4" />
    <line x1="7" y1="9" x2="14" y2="9" opacity="0.5" />
    <line x1="7" y1="12" x2="14" y2="12" opacity="0.5" />
    <line x1="7" y1="15" x2="11" y2="15" opacity="0.5" />
  </svg>
)

export function AboutPage() {
  const { t } = useTranslation()
  return (
    <SidebarNavigation
      title="Deck Shelves Docs"
      showTitle
      pages={[
        { title: t('docs_overview_title'), content: <OverviewPage />, route: '/deck-shelves/about/overview', icon: bookPageIcon, hideTitle: true },
        { title: t('about_howto_title'), content: <HowToPage />, route: '/deck-shelves/about/howto', icon: bookPageIcon, hideTitle: true },
        { title: t('docs_shelves_title'), content: <ShelvesPage />, route: '/deck-shelves/about/shelves', icon: bookPageIcon, hideTitle: true },
        { title: t('docs_filters_title'), content: <FiltersPage />, route: '/deck-shelves/about/filters', icon: bookPageIcon, hideTitle: true },
        { title: t('about'), content: <SupportPage />, route: '/deck-shelves/about/support', icon: bookPageIcon, hideTitle: true },
      ]}
    />
  )
}
