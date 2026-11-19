from typing import Any, Dict, List, Optional


def _sanitize_visibility(raw: Any) -> Optional[Dict[str, Any]]:  # noqa: C901
    """Visibility Rules v2 tree: { mode: 'any'|'all', rules: [{ kind, ... }] }.
    Whitelist-clean but forward-compatible — each rule keeps its `kind` plus
    scalar / scalar-list params, so device-state kinds added later round-trip
    without a backend change. Returns None when there are no usable rules
    (absent == no visibility restriction), matching the legacy window fields.
    """
    if not isinstance(raw, dict):
        return None
    rules_in = raw.get("rules")
    if not isinstance(rules_in, list):
        return None
    cleaned_rules: List[Dict[str, Any]] = []
    for r in rules_in[:20]:
        if not isinstance(r, dict):
            continue
        kind = r.get("kind")
        if not isinstance(kind, str) or not kind:
            continue
        rule: Dict[str, Any] = {"kind": kind[:40]}
        for k, v in r.items():
            if k == "kind" or not isinstance(k, str):
                continue
            if isinstance(v, (bool, int, float, str)):
                rule[k[:40]] = v
            elif isinstance(v, list):
                rule[k[:40]] = [x for x in v if isinstance(x, (bool, int, float, str))][:32]
        cleaned_rules.append(rule)
    if not cleaned_rules:
        return None
    mode = raw.get("mode")
    return {"mode": mode if mode in ("any", "all") else "any", "rules": cleaned_rules}
