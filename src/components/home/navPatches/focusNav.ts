/* Steam's gamepad focus-navigation internals, as this client build exposes
   them (field names vary between builds, hence the alternatives). */
export function resolveFocusNavController(): any {
  const g = globalThis as any;
  return g.FocusNavController ?? g.GamepadNavTree?.m_context?.m_controller;
}

/* Every navigation tree of the controller's active context (or, between
   contexts, of the last active one). */
export function activeNavTrees(): any[] {
  const ctrl = resolveFocusNavController();
  const context = ctrl?.m_ActiveContext || ctrl?.m_LastActiveContext;
  return context?.m_rgGamepadNavigationTrees ?? [];
}

/* The root node of the main ("GamepadUI_Full_Root") navigation tree of a
   controller context, or null when the context has no such tree. */
export function findMainNavRoot(context: any): any | null {
  const trees: any[] = context?.m_rgGamepadNavigationTrees ?? [];
  const mainTree = trees.find((t: any) => t.m_ID === "GamepadUI_Full_Root");
  return mainTree ? (mainTree.Root || mainTree.m_Root || mainTree) : null;
}

/* The DOM element behind a nav-tree node. */
export function navNodeElement(node: any): HTMLElement | null {
  return node?.Element || node?.m_element || node?.m_Element || null;
}
