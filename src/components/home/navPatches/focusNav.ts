// Field names vary between Steam builds, hence the alternatives.
export function resolveFocusNavController(): any {
  const g = globalThis as any;
  return g.FocusNavController ?? g.GamepadNavTree?.m_context?.m_controller;
}

export function activeNavTrees(): any[] {
  const ctrl = resolveFocusNavController();
  const context = ctrl?.m_ActiveContext || ctrl?.m_LastActiveContext;
  return context?.m_rgGamepadNavigationTrees ?? [];
}

export function findMainNavRoot(context: any): any | null {
  const trees: any[] = context?.m_rgGamepadNavigationTrees ?? [];
  const mainTree = trees.find((t: any) => t.m_ID === "GamepadUI_Full_Root");
  return mainTree ? (mainTree.Root || mainTree.m_Root || mainTree) : null;
}

export function navNodeElement(node: any): HTMLElement | null {
  return node?.Element || node?.m_element || node?.m_Element || null;
}
