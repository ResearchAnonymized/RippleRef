"""
Scientific Code Smell Prioritization

Ranks code smells by:
1. Impact on maintainability (from software engineering literature)
2. Feasibility of automated fix (safe refactoring patterns from Fowler's catalog)
3. Locality (can be fixed within a single file without breaking dependents)
4. Grouping (related smells that share the same root cause / location)

References:
- Fowler, M. (2018). Refactoring: Improving the Design of Existing Code (2nd ed.)
- Mantyla, M. V., & Lassenius, C. (2006). Subjective evaluation of software evolvability
"""

from typing import List, Dict, Tuple
import re


# Smells we CAN safely fix within a single file, ranked by research-backed impact.
# Impact score (1-10): based on effect on maintainability index, readability, and defect proneness.
# Safety score (1-10): how safely an LLM can fix this without breaking behavior.
# Combined = impact * safety_weight. Higher = fix first.
SMELL_CATALOG = {
    # --- HIGH IMPACT, HIGH SAFETY (fix these first) ---
    "long-method": {
        "impact": 9, "safety": 9,
        "technique": "Extract Method",
        "description": "Break long method into smaller, well-named helper methods",
        "max_per_file": 3,
        "category": "bloater",
    },
    "complex-method": {
        "impact": 8, "safety": 8,
        "technique": "Simplify Conditional / Extract Method",
        "description": "Reduce cyclomatic complexity with guard clauses and extracted methods",
        "max_per_file": 3,
        "category": "bloater",
    },
    "duplicate-code": {
        "impact": 8, "safety": 8,
        "technique": "Extract Method",
        "description": "Extract duplicated logic into a shared method",
        "max_per_file": 3,
        "category": "dispensable",
    },
    "nested-conditionals": {
        "impact": 7, "safety": 9,
        "technique": "Replace Nested Conditional with Guard Clauses",
        "description": "Flatten deeply nested if/else with early returns",
        "max_per_file": 3,
        "category": "bloater",
    },
    "empty-catch-block": {
        "impact": 9, "safety": 9,
        "technique": "Add Proper Error Handling",
        "description": "Replace empty catch blocks with logging or proper exception handling",
        "max_per_file": 5,
        "category": "error-handling",
    },
    "magic-number": {
        "impact": 5, "safety": 10,
        "technique": "Replace Magic Number with Named Constant",
        "description": "Extract magic numbers into well-named static final constants",
        "max_per_file": 5,
        "category": "naming",
    },
    "string-concatenation": {
        "impact": 6, "safety": 9,
        "technique": "Replace Concatenation with StringBuilder",
        "description": "Use StringBuilder for string concatenation in loops",
        "max_per_file": 3,
        "category": "performance",
    },

    # --- MEDIUM IMPACT, MEDIUM SAFETY ---
    "god-class": {
        "impact": 10, "safety": 4,
        "technique": "Extract Class",
        "description": "Extract cohesive groups of fields+methods into separate classes",
        "max_per_file": 1,
        "category": "bloater",
    },
    "large-class": {
        "impact": 8, "safety": 4,
        "technique": "Extract Class / Extract Subclass",
        "description": "Split large class by responsibility",
        "max_per_file": 1,
        "category": "bloater",
    },
    "long-parameter-list": {
        "impact": 6, "safety": 6,
        "technique": "Introduce Parameter Object",
        "description": "Group related parameters into a parameter object",
        "max_per_file": 2,
        "category": "bloater",
    },
    "data-class": {
        "impact": 5, "safety": 5,
        "technique": "Move Method / Encapsulate Field",
        "description": "Add behavior to data-only class or encapsulate public fields",
        "max_per_file": 1,
        "category": "oo-abuser",
    },

    # --- LOW IMPACT or LOW SAFETY (skip or do last) ---
    "feature-envy": {
        "impact": 6, "safety": 3,
        "technique": "Move Method",
        "description": "Move method to the class whose data it uses most",
        "max_per_file": 1,
        "category": "coupler",
    },
    "lazy-class": {
        "impact": 3, "safety": 3,
        "technique": "Inline Class",
        "description": "Merge underused class into its caller",
        "max_per_file": 1,
        "category": "dispensable",
    },
    "inconsistent-naming": {
        "impact": 4, "safety": 3,
        "technique": "Rename",
        "description": "Apply consistent naming conventions",
        "max_per_file": 5,
        "category": "naming",
    },
}

# Smells we should NOT try to fix automatically (too risky or cross-file)
SKIP_SMELLS = {
    "dead-code",           # Risky: might be used via reflection
    "speculative-generality",  # Subjective
    "middle-man",          # Requires understanding call chains
    "inappropriate-intimacy",  # Cross-file coupling
    "shotgun-surgery",     # Cross-file by definition
    "divergent-change",    # Architectural, not per-file
    "parallel-inheritance",  # Cross-file
    "circular-dependencies",  # Cross-file
    "refused-bequest",     # Inheritance hierarchy, risky
}


def _normalize_smell_id(smell: Dict) -> str:
    """Extract a canonical smell ID from various field names."""
    raw = (
        smell.get("detectorId")
        or smell.get("type")
        or smell.get("title")
        or smell.get("smellId")
        or ""
    )
    raw = str(raw).lower().strip()
    # Strip common prefixes
    for prefix in ("design.", "code.", "smell.", "bloater.", "dispensable."):
        if raw.startswith(prefix):
            raw = raw[len(prefix):]
    return raw


def _get_method_at_line(code: str, line_number: int) -> str:
    """Find which method contains a given line number."""
    lines = code.split("\n")
    method_pattern = re.compile(
        r'(public|private|protected)\s+\w+\s+(\w+)\s*\('
    )
    current_method = "<class-level>"
    brace_depth = 0
    for i, line in enumerate(lines):
        m = method_pattern.search(line)
        if m:
            current_method = m.group(2)
        if i + 1 == line_number:
            return current_method
        brace_depth += line.count("{") - line.count("}")
    return current_method


def prioritize_smells(
    smells: List[Dict],
    code: str,
    max_total: int = 8,
) -> List[Dict]:
    """
    Select the most impactful, safely-fixable smells from a file.

    Returns a prioritized list with at most `max_total` smells,
    grouped by location and ranked by (impact * safety).
    """
    if not smells:
        return []

    scored: List[Tuple[float, Dict, Dict]] = []

    for smell in smells:
        smell_id = _normalize_smell_id(smell)

        # Skip smells we can't safely fix
        if any(skip in smell_id for skip in SKIP_SMELLS):
            continue

        # Find matching catalog entry
        catalog_entry = None
        for key, entry in SMELL_CATALOG.items():
            if key in smell_id or smell_id in key:
                catalog_entry = entry
                break

        if not catalog_entry:
            # Unknown smell — assign low priority
            catalog_entry = {
                "impact": 3, "safety": 3,
                "technique": "General Refactoring",
                "description": "Apply standard improvement",
                "max_per_file": 2,
                "category": "other",
            }

        # Severity multiplier
        sev = str(smell.get("severity", "")).upper()
        sev_mult = {"CRITICAL": 1.5, "MAJOR": 1.2, "MINOR": 0.8}.get(sev, 1.0)

        # Composite score: impact * safety * severity
        score = catalog_entry["impact"] * catalog_entry["safety"] * sev_mult

        # Attach location info
        start_line = smell.get("startLine") or smell.get("lineNumber") or 0
        method = _get_method_at_line(code, start_line) if start_line and code else "<unknown>"

        enriched = {
            **smell,
            "_score": score,
            "_catalog": catalog_entry,
            "_method": method,
            "_smell_id": smell_id,
        }
        scored.append((score, enriched, catalog_entry))

    # Sort by score descending
    scored.sort(key=lambda x: -x[0])

    # Group by smell type and cap per type
    type_counts: Dict[str, int] = {}
    selected: List[Dict] = []

    for score, enriched, catalog in scored:
        smell_id = enriched["_smell_id"]
        # Find the catalog key this matches
        cat_key = smell_id
        for key in SMELL_CATALOG:
            if key in smell_id or smell_id in key:
                cat_key = key
                break
        cap = catalog.get("max_per_file", 3)
        current = type_counts.get(cat_key, 0)
        if current >= cap:
            continue
        type_counts[cat_key] = current + 1
        selected.append(enriched)
        if len(selected) >= max_total:
            break

    return selected


def build_refactoring_instructions(
    selected_smells: List[Dict],
) -> str:
    """
    Build a concise, targeted refactoring instruction set for the LLM.
    Groups by method location for coherent refactoring.
    """
    if not selected_smells:
        return "No specific smells to address. Apply general readability improvements only."

    # Group by method
    by_method: Dict[str, List[Dict]] = {}
    for s in selected_smells:
        method = s.get("_method", "<unknown>")
        by_method.setdefault(method, []).append(s)

    lines = []
    lines.append(f"TARGET: Fix {len(selected_smells)} prioritized code smells.\n")

    for method, group in by_method.items():
        lines.append(f"In method `{method}`:")
        for s in group:
            cat = s.get("_catalog", {})
            technique = cat.get("technique", "General Refactoring")
            desc = (
                s.get("description")
                or s.get("summary")
                or s.get("title")
                or s.get("_smell_id", "unknown smell")
            )
            severity = str(s.get("severity", "")).upper()
            location = ""
            sl = s.get("startLine") or s.get("lineNumber")
            el = s.get("endLine")
            if sl:
                location = f" (line {sl}" + (f"-{el}" if el else "") + ")"

            lines.append(
                f"  [{severity}] {desc}{location}"
                f"\n    → Apply: {technique} — {cat.get('description', '')}"
            )
        lines.append("")

    return "\n".join(lines)


def build_public_api_signature(code: str) -> List[str]:
    """
    Extract all public method signatures for behavior preservation checking.
    Returns list of normalized signatures like: "public void methodName(String, int)"
    """
    signatures = []
    pattern = re.compile(
        r'public\s+'
        r'(?:static\s+)?'
        r'(?:final\s+)?'
        r'(?:synchronized\s+)?'
        r'(\w+(?:<[^>]+>)?(?:\[\])?)\s+'  # return type
        r'(\w+)\s*'                         # method name
        r'\(([^)]*)\)'                       # parameters
    )
    for match in pattern.finditer(code):
        ret_type = match.group(1)
        name = match.group(2)
        params_raw = match.group(3).strip()
        # Normalize params to just types
        if params_raw:
            param_types = []
            for param in params_raw.split(","):
                parts = param.strip().split()
                if len(parts) >= 2:
                    # Remove annotations like @NotNull
                    type_parts = [p for p in parts[:-1] if not p.startswith("@")]
                    param_types.append(" ".join(type_parts))
                elif len(parts) == 1:
                    param_types.append(parts[0])
            params = ", ".join(param_types)
        else:
            params = ""
        signatures.append(f"public {ret_type} {name}({params})")
    return sorted(signatures)
