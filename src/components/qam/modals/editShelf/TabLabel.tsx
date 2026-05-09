/**
 * Tab title with optional leading icon — uses inline-flex so the icon
 * aligns vertically with the label text. Applied selectively (not every
 * tab) so the strip stays uncluttered. Shared by `EditShelfModal` and
 * `EditSmartShelfModal`.
 */
export function TabLabel({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}
      {text}
    </span>
  )
}
