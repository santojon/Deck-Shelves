import React from "react";
import { Focusable, SidebarNavigation, DialogButton } from "@decky/ui";
import { useTranslation } from "react-i18next";
import pkg from "../../package.json";

const KOFI_URL = "https://ko-fi.com/F2F61WE76V";

const heading: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#fff",
  marginBottom: 12,
};

const subheading: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#dcdedf",
  marginBottom: 8,
  marginTop: 18,
};

const body: React.CSSProperties = {
  fontSize: 13,
  color: "#b8bcbf",
  lineHeight: "19px",
  marginBottom: 8,
};

const listStyle: React.CSSProperties = {
  ...body,
  paddingLeft: 10,
  marginBottom: 4,
};

const stepNum: React.CSSProperties = {
  display: "inline-block",
  width: 20,
  fontWeight: 700,
  color: "#dcdedf",
};

const bookPageIcon = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <path d="M4 2h9l4 4v12H4V2z" fill="currentColor" opacity="0.15" />
    <path d="M4 2h9l4 4v12H4V2z" />
    <path d="M13 2v4h4" />
    <line x1="7" y1="9" x2="14" y2="9" opacity="0.5" />
    <line x1="7" y1="12" x2="14" y2="12" opacity="0.5" />
    <line x1="7" y1="15" x2="11" y2="15" opacity="0.5" />
  </svg>
);

function DocSection({ children }: { children: React.ReactNode }) {
  return (
    <Focusable
      style={{ display: "flex", flexDirection: "column", padding: "16px 20px" }}
      // @ts-ignore
      noFocusRing={true}
    >
      {children}
    </Focusable>
  );
}

function OverviewPage() {
  const { t } = useTranslation();
  return (
    <DocSection>
      <div style={heading}>{t("docs_overview_title")}</div>
      <div style={body}>{t("about_description")}</div>
      <div style={subheading}>{t("about_features_title")}</div>
      {[
        t("about_feature_shelves"),
        t("about_feature_sources"),
        t("about_feature_filters"),
        t("about_feature_advanced_groups"),
        t("about_feature_new_filters"),
        t("about_feature_new_sorts"),
        t("about_feature_api"),
        t("about_feature_unifideck"),
        t("about_feature_first_run"),
        t("about_feature_templates"),
        t("about_feature_refresh"),
        t("about_feature_suspend_resume"),
        t("about_feature_ci_tests"),
        t("about_feature_screenshot_automation"),
        t("about_feature_atomic_settings"),
        t("about_feature_sort"),
        t("about_feature_reorder"),
        t("about_feature_visibility"),
        t("about_feature_import_export"),
        t("about_feature_external_imports"),
        t("about_feature_duplicate"),
        t("about_feature_compat"),
        t("about_feature_playtime"),
      ].map((f, i) => (
        <div key={i} style={listStyle}>• {f}</div>
      ))}
    </DocSection>
  );
}

function HowToPage() {
  const { t } = useTranslation();
  return (
    <DocSection>
      <div style={heading}>{t("about_howto_title")}</div>
      {[
        t("about_howto_step1"),
        t("about_howto_step2"),
        t("about_howto_step3"),
        t("about_howto_step4"),
        t("about_howto_step5"),
      ].map((s, i) => (
        <div key={i} style={listStyle}>
          <span style={stepNum}>{i + 1}.</span>{s}
        </div>
      ))}
    </DocSection>
  );
}

function ShelvesPage() {
  const { t } = useTranslation();
  return (
    <DocSection>
      <div style={heading}>{t("docs_shelves_title")}</div>
      <div style={body}>{t("docs_shelves_intro")}</div>
      <div style={subheading}>{t("docs_shelves_sources_title")}</div>
      <div style={listStyle}>• <b>{t("source_collection")}</b> — {t("docs_shelves_source_collection")}</div>
      <div style={listStyle}>• <b>{t("source_tab")}</b> — {t("docs_shelves_source_tab")}</div>
      <div style={listStyle}>• <b>{t("source_filter")}</b> — {t("docs_shelves_source_filter")}</div>
      <div style={subheading}>{t("docs_shelves_manage_title")}</div>
      <div style={body}>{t("docs_shelves_manage_body")}</div>
    </DocSection>
  );
}

function FiltersPage() {
  const { t } = useTranslation();
  return (
    <DocSection>
      <div style={heading}>{t("docs_filters_title")}</div>
      <div style={body}>{t("docs_filters_intro")}</div>
      <div style={listStyle}>• <b>{t("filter_favorites")}</b></div>
      <div style={listStyle}>• <b>{t("filter_installed")}</b></div>
      <div style={listStyle}>• <b>{t("filter_nonsteam")}</b></div>
      <div style={listStyle}>• <b>{t("filter_name")}</b></div>
      <div style={listStyle}>• <b>{t("filter_days")}</b></div>
      <div style={listStyle}>• <b>{t("compat_verified")}</b> / <b>{t("compat_playable")}</b> / <b>{t("compat_unsupported")}</b> / <b>{t("compat_unknown")}</b></div>
      <div style={subheading}>{t("docs_filters_sort_title")}</div>
      <div style={body}>{t("docs_filters_sort_body")}</div>
    </DocSection>
  );
}

function SupportPage() {
  const { t } = useTranslation();
  return (
    <DocSection>
      <div style={heading}>{t("about_support_title")}</div>
      <div style={body}>{t("about_support_description")}</div>
      <Focusable style={{ marginTop: 8, marginBottom: 16 }}>
        <DialogButton
          onClick={() => {
            try { (window as any).SteamClient?.System?.OpenInSystemBrowser?.(KOFI_URL); } catch {}
          }}
          onOKButton={() => {
            try { (window as any).SteamClient?.System?.OpenInSystemBrowser?.(KOFI_URL); } catch {}
          }}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 16px", minWidth: 0 }}
        >
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18, marginRight: 8, flexShrink: 0 }}>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ff5e5b" />
          </svg>
          Ko-fi
        </DialogButton>
      </Focusable>

      <div style={subheading}>{t("about_limitations_title")}</div>
      {[
        t("about_limitation_deck_only"),
        t("about_limitation_decky"),
        t("about_limitation_home"),
      ].map((l, i) => (
        <div key={i} style={listStyle}>• {l}</div>
      ))}

      <div style={{ marginTop: 24, fontSize: 11, color: "#666", textAlign: "center" }}>
        {t("about_version")}: {pkg.version}
      </div>
    </DocSection>
  );
}

export function AboutPage() {
  const { t } = useTranslation();
  return (
    <SidebarNavigation
      title="Deck Shelves Docs"
      showTitle
      pages={[
        {
          title: t("docs_overview_title"),
          content: <OverviewPage />,
          route: "/deck-shelves/about/overview",
          icon: bookPageIcon,
          hideTitle: true,
        },
        {
          title: t("about_howto_title"),
          content: <HowToPage />,
          route: "/deck-shelves/about/howto",
          icon: bookPageIcon,
          hideTitle: true,
        },
        {
          title: t("docs_shelves_title"),
          content: <ShelvesPage />,
          route: "/deck-shelves/about/shelves",
          icon: bookPageIcon,
          hideTitle: true,
        },
        {
          title: t("docs_filters_title"),
          content: <FiltersPage />,
          route: "/deck-shelves/about/filters",
          icon: bookPageIcon,
          hideTitle: true,
        },
        {
          title: t("about"),
          content: <SupportPage />,
          route: "/deck-shelves/about/support",
          icon: bookPageIcon,
          hideTitle: true,
        },
      ]}
    />
  );
}
