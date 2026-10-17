#!/usr/bin/env python3
"""
Comprehensive Code Metrics Calculator for Java Source Code.

Computes research-grade metrics for evaluating refactoring effectiveness:
- Halstead metrics (vocabulary, volume, difficulty, effort)
- Method length distribution (mean, median, max, stdev)
- Nesting depth (max and average)
- Coupling (CBO - Coupling Between Objects)
- Cohesion (LCOM - Lack of Cohesion of Methods)
- Diff churn (lines added/removed/modified)
- Semantic preservation (public API surface ratio)
- Token efficiency
"""

import re
import math
import difflib
import statistics
from typing import Dict, List, Optional, Tuple, Set


# ── Java Operators and Keywords for Halstead ──────────────────────────────

JAVA_OPERATORS = {
    '+', '-', '*', '/', '%', '++', '--',
    '==', '!=', '>', '<', '>=', '<=',
    '&&', '||', '!',
    '&', '|', '^', '~', '<<', '>>', '>>>',
    '=', '+=', '-=', '*=', '/=', '%=',
    '&=', '|=', '^=', '<<=', '>>=', '>>>=',
    '?', ':', '->', '::', '.',
    'new', 'instanceof', 'return', 'throw', 'throws',
    'if', 'else', 'for', 'while', 'do', 'switch', 'case',
    'try', 'catch', 'finally', 'break', 'continue',
}


def compute_all_metrics(code: str) -> Dict:
    """Compute all research metrics for a single Java source file."""
    return {
        "halstead": compute_halstead(code),
        "method_lengths": compute_method_length_distribution(code),
        "nesting_depth": compute_nesting_depth(code),
        "coupling": compute_coupling(code),
        "cohesion": compute_cohesion(code),
    }


def compute_before_after(original: str, refactored: str,
                         token_usage: Optional[Dict] = None) -> Dict:
    """Compute all before/after metrics plus diff-based metrics."""
    before = compute_all_metrics(original)
    after = compute_all_metrics(refactored)

    diff = compute_diff_churn(original, refactored)
    semantic = compute_semantic_preservation(original, refactored)
    token_eff = compute_token_efficiency(original, refactored, token_usage)

    def delta(b, a, key, higher_is_better=True):
        bv = b.get(key, 0) or 0
        av = a.get(key, 0) or 0
        change = round(av - bv, 4)
        if higher_is_better is None:
            # Structural counts (method/field totals): direction is informational only.
            improved = None
        elif change == 0:
            improved = True
        else:
            improved = (change > 0) if higher_is_better else (change < 0)
        return {"before": bv, "after": av, "change": change, "improved": improved}

    return {
        "halstead": {
            "vocabulary": delta(before["halstead"], after["halstead"], "vocabulary", False),
            "volume": delta(before["halstead"], after["halstead"], "volume", False),
            "difficulty": delta(before["halstead"], after["halstead"], "difficulty", False),
            "effort": delta(before["halstead"], after["halstead"], "effort", False),
            "estimated_bugs": delta(before["halstead"], after["halstead"], "estimated_bugs", False),
        },
        "method_lengths": {
            "mean": delta(before["method_lengths"], after["method_lengths"], "mean", False),
            "median": delta(before["method_lengths"], after["method_lengths"], "median", False),
            "max": delta(before["method_lengths"], after["method_lengths"], "max", False),
            "stdev": delta(before["method_lengths"], after["method_lengths"], "stdev", False),
            "count": delta(before["method_lengths"], after["method_lengths"], "count", True),
        },
        "nesting_depth": {
            "max": delta(before["nesting_depth"], after["nesting_depth"], "max", False),
            "average": delta(before["nesting_depth"], after["nesting_depth"], "average", False),
            "deep_nests": delta(before["nesting_depth"], after["nesting_depth"], "deep_nests", False),
        },
        "coupling": {
            "cbo": delta(before["coupling"], after["coupling"], "cbo", False),
            "import_count": delta(before["coupling"], after["coupling"], "import_count", False),
            "type_references": delta(before["coupling"], after["coupling"], "type_references", False),
        },
        "cohesion": {
            "lcom": delta(before["cohesion"], after["cohesion"], "lcom", False),
            "methods": delta(before["cohesion"], after["cohesion"], "methods", None),
            "fields": delta(before["cohesion"], after["cohesion"], "fields", None),
        },
        "diff_churn": diff,
        "semantic_preservation": semantic,
        "token_efficiency": token_eff,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Halstead Metrics
# ═══════════════════════════════════════════════════════════════════════════

def _tokenize_java(code: str) -> Tuple[List[str], List[str]]:
    """Split Java code into operators and operands (simplified tokenizer)."""
    code = re.sub(r'//.*', '', code)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    code = re.sub(r'"(?:[^"\\]|\\.)*"', '"STR"', code)
    code = re.sub(r"'(?:[^'\\]|\\.)*'", "'C'", code)

    operators = []
    operands = []

    tokens = re.findall(r'>>>|>>>=|<<=|>>=|&&|\|\||[+\-*/%&|^~<>=!]=?|->|::|[.?:;,{}()\[\]]|\b\w+\b|"STR"|\'C\'', code)

    for tok in tokens:
        if tok in JAVA_OPERATORS or tok in {';', ',', '{', '}', '(', ')', '[', ']'}:
            operators.append(tok)
        elif tok in {'public', 'private', 'protected', 'static', 'final', 'abstract',
                     'void', 'class', 'interface', 'enum', 'extends', 'implements',
                     'import', 'package', 'this', 'super', 'null', 'true', 'false',
                     'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short',
                     'synchronized', 'volatile', 'transient', 'native', 'strictfp',
                     'assert', 'default'}:
            operators.append(tok)
        else:
            operands.append(tok)

    return operators, operands


def compute_halstead(code: str) -> Dict:
    """Compute Halstead complexity metrics."""
    operators, operands = _tokenize_java(code)

    n1 = len(set(operators))  # unique operators
    n2 = len(set(operands))   # unique operands
    N1 = len(operators)       # total operators
    N2 = len(operands)        # total operands

    n = n1 + n2               # vocabulary
    N = N1 + N2               # length

    if n == 0 or n2 == 0 or N2 == 0:
        return {"vocabulary": 0, "length": 0, "volume": 0.0,
                "difficulty": 0.0, "effort": 0.0, "estimated_bugs": 0.0,
                "time_to_implement": 0.0}

    volume = N * math.log2(n) if n > 1 else 0.0
    difficulty = (n1 / 2.0) * (N2 / n2)
    effort = volume * difficulty
    bugs = volume / 3000.0
    time_s = effort / 18.0

    return {
        "vocabulary": n,
        "length": N,
        "volume": round(volume, 2),
        "difficulty": round(difficulty, 2),
        "effort": round(effort, 2),
        "estimated_bugs": round(bugs, 3),
        "time_to_implement": round(time_s, 2),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Method Length Distribution
# ═══════════════════════════════════════════════════════════════════════════

def _extract_methods(code: str) -> List[Dict]:
    """Extract method bodies with line counts from Java source."""
    methods = []
    lines = code.splitlines()

    method_pattern = re.compile(
        r'^\s*((?:public|private|protected|static|final|abstract|synchronized|native|strictfp)\s+)*'
        r'(?:(?:<[^>]+>\s+)?)'
        r'(\w[\w<>\[\],\s]*?)\s+'
        r'(\w+)\s*\('
    )

    i = 0
    while i < len(lines):
        line = lines[i]
        m = method_pattern.match(line)
        if m:
            method_name = m.group(3)
            if method_name in ('if', 'for', 'while', 'switch', 'catch', 'class', 'interface', 'enum'):
                i += 1
                continue

            start = i
            brace_count = 0
            found_open = False
            j = i
            while j < len(lines):
                for ch in lines[j]:
                    if ch == '{':
                        brace_count += 1
                        found_open = True
                    elif ch == '}':
                        brace_count -= 1
                if found_open and brace_count == 0:
                    methods.append({
                        "name": method_name,
                        "start_line": start + 1,
                        "end_line": j + 1,
                        "length": j - start + 1,
                        "body": "\n".join(lines[start:j + 1]),
                    })
                    i = j + 1
                    break
                j += 1
            else:
                i += 1
        else:
            i += 1

    return methods


def compute_method_length_distribution(code: str) -> Dict:
    """Compute method length statistics."""
    methods = _extract_methods(code)
    lengths = [m["length"] for m in methods]

    if not lengths:
        return {"count": 0, "mean": 0.0, "median": 0.0, "max": 0,
                "min": 0, "stdev": 0.0, "long_methods": 0,
                "methods": []}

    return {
        "count": len(lengths),
        "mean": round(statistics.mean(lengths), 1),
        "median": round(statistics.median(lengths), 1),
        "max": max(lengths),
        "min": min(lengths),
        "stdev": round(statistics.stdev(lengths), 1) if len(lengths) > 1 else 0.0,
        "long_methods": sum(1 for l in lengths if l > 20),
        "methods": [{"name": m["name"], "length": m["length"]} for m in methods],
    }


# ═══════════════════════════════════════════════════════════════════════════
# Nesting Depth
# ═══════════════════════════════════════════════════════════════════════════

def compute_nesting_depth(code: str) -> Dict:
    """Compute nesting depth statistics for control structures."""
    lines = code.splitlines()
    depths = []
    current_depth = 0
    max_depth = 0
    nesting_openers = re.compile(r'\b(if|else|for|while|do|switch|try|catch|finally)\b')

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('//') or stripped.startswith('*'):
            continue

        opens = stripped.count('{')
        closes = stripped.count('}')

        if nesting_openers.search(stripped) and opens > 0:
            depths.append(current_depth + 1)

        current_depth += opens - closes
        current_depth = max(0, current_depth)
        max_depth = max(max_depth, current_depth)

    avg_depth = round(statistics.mean(depths), 2) if depths else 0.0

    return {
        "max": max_depth,
        "average": avg_depth,
        "deep_nests": sum(1 for d in depths if d > 3),
        "depth_distribution": {
            "1": sum(1 for d in depths if d == 1),
            "2": sum(1 for d in depths if d == 2),
            "3": sum(1 for d in depths if d == 3),
            "4+": sum(1 for d in depths if d >= 4),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════
# Coupling (CBO - Coupling Between Objects)
# ═══════════════════════════════════════════════════════════════════════════

JAVA_BUILTIN_TYPES = {
    'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short', 'void',
    'String', 'Object', 'Integer', 'Long', 'Double', 'Float', 'Boolean', 'Character',
    'Byte', 'Short', 'Void', 'Number', 'Class', 'System', 'Math', 'Arrays',
    'Collections', 'Objects', 'Optional',
    'List', 'ArrayList', 'LinkedList', 'Set', 'HashSet', 'TreeSet', 'LinkedHashSet',
    'Map', 'HashMap', 'TreeMap', 'LinkedHashMap', 'ConcurrentHashMap',
    'Collection', 'Iterable', 'Iterator', 'Comparator', 'Comparable',
    'Exception', 'RuntimeException', 'Error', 'Throwable',
    'IOException', 'IllegalArgumentException', 'IllegalStateException',
    'NullPointerException', 'IndexOutOfBoundsException', 'ClassCastException',
    'Override', 'Deprecated', 'SuppressWarnings', 'FunctionalInterface',
    'Runnable', 'Callable', 'Thread', 'StringBuilder', 'StringBuffer',
}


def compute_coupling(code: str) -> Dict:
    """Compute CBO (Coupling Between Objects) metric."""
    imports = re.findall(r'import\s+(?:static\s+)?([a-zA-Z0-9_.]+);', code)
    import_types = set()
    for imp in imports:
        parts = imp.split('.')
        type_name = parts[-1] if parts[-1] != '*' else parts[-2]
        import_types.add(type_name)

    type_refs = set()
    code_no_comments = re.sub(r'//.*', '', code)
    code_no_comments = re.sub(r'/\*.*?\*/', '', code_no_comments, flags=re.DOTALL)
    code_no_comments = re.sub(r'"(?:[^"\\]|\\.)*"', '""', code_no_comments)

    type_pattern = re.compile(r'\b([A-Z][a-zA-Z0-9_]*)\b')
    for match in type_pattern.finditer(code_no_comments):
        type_name = match.group(1)
        if type_name not in JAVA_BUILTIN_TYPES:
            type_refs.add(type_name)

    own_classes = set(re.findall(r'\bclass\s+(\w+)', code))
    own_classes.update(re.findall(r'\binterface\s+(\w+)', code))
    own_classes.update(re.findall(r'\benum\s+(\w+)', code))

    external_types = type_refs - own_classes

    return {
        "cbo": len(external_types),
        "import_count": len(imports),
        "type_references": len(type_refs),
        "external_types": sorted(list(external_types))[:30],
    }


# ═══════════════════════════════════════════════════════════════════════════
# Cohesion (LCOM — Lack of Cohesion of Methods)
# ═══════════════════════════════════════════════════════════════════════════

def compute_cohesion(code: str) -> Dict:
    """
    Compute LCOM4 (Lack of Cohesion of Methods).
    LCOM = number of method pairs sharing no fields - pairs sharing fields.
    Higher LCOM → less cohesive → candidate for Extract Class.
    """
    fields = set()
    # Match instance/static fields (primitives and reference types).
    field_pattern = re.compile(
        r'^\s*(?:(?:public|private|protected|static|final|volatile|transient)\s+)+'
        r'(?!return|throw|if|for|while|class|interface|enum|new|import|package)'
        r'(?:[\w.<>,\[\]]+\s+)+'  # type (e.g. int, String, List<Foo>)
        r'(\w+)\s*(?:=\s*[^;]+)?;',
        re.MULTILINE,
    )
    for m in field_pattern.finditer(code):
        fields.add(m.group(1))

    methods = _extract_methods(code)

    method_fields: Dict[str, Set[str]] = {}
    for meth in methods:
        used = set()
        for f in fields:
            if re.search(r'\b' + re.escape(f) + r'\b', meth["body"]):
                used.add(f)
        method_fields[meth["name"]] = used

    method_names = list(method_fields.keys())
    P = 0  # pairs sharing NO fields
    Q = 0  # pairs sharing fields

    for i in range(len(method_names)):
        for j in range(i + 1, len(method_names)):
            shared = method_fields[method_names[i]] & method_fields[method_names[j]]
            if shared:
                Q += 1
            else:
                P += 1

    lcom = max(0, P - Q)

    return {
        "lcom": lcom,
        "methods": len(methods),
        "fields": len(fields),
        "cohesive_pairs": Q,
        "non_cohesive_pairs": P,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Diff Churn
# ═══════════════════════════════════════════════════════════════════════════

def compute_diff_churn(original: str, refactored: str) -> Dict:
    """Compute line-level diff statistics."""
    orig_lines = original.splitlines(keepends=True)
    ref_lines = refactored.splitlines(keepends=True)

    differ = difflib.unified_diff(orig_lines, ref_lines, lineterm='')
    added = 0
    removed = 0
    hunks = 0
    in_hunk = False

    for line in differ:
        if line.startswith('@@'):
            hunks += 1
            in_hunk = True
        elif line.startswith('+') and not line.startswith('+++'):
            added += 1
        elif line.startswith('-') and not line.startswith('---'):
            removed += 1

    modified = min(added, removed)

    total_original = len(orig_lines)
    churn_rate = round((added + removed) / max(1, total_original) * 100, 1)

    return {
        "lines_added": added,
        "lines_removed": removed,
        "lines_modified": modified,
        "net_change": added - removed,
        "hunks": hunks,
        "churn_rate_percent": churn_rate,
        "total_changes": added + removed,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Semantic Preservation (Public API Surface)
# ═══════════════════════════════════════════════════════════════════════════

def _extract_public_api(code: str) -> Dict[str, List[str]]:
    """Extract public API surface: public method signatures, class declarations."""
    api = {
        "classes": [],
        "methods": [],
        "fields": [],
    }

    class_pattern = re.compile(r'public\s+(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+(\w+)')
    for m in class_pattern.finditer(code):
        api["classes"].append(m.group(1))

    method_pattern = re.compile(
        r'public\s+(?:static\s+|final\s+|abstract\s+|synchronized\s+)*'
        r'(?:<[^>]+>\s+)?'
        r'(\w[\w<>\[\],\s]*?)\s+'
        r'(\w+)\s*\(([^)]*)\)'
    )
    for m in method_pattern.finditer(code):
        return_type = m.group(1).strip()
        name = m.group(2)
        params = m.group(3).strip()
        param_types = []
        if params:
            for p in params.split(','):
                parts = p.strip().split()
                if len(parts) >= 2:
                    param_types.append(parts[-2])
        sig = f"{return_type} {name}({', '.join(param_types)})"
        api["methods"].append(sig)

    field_pattern = re.compile(
        r'public\s+(?:static\s+|final\s+)*(\w[\w<>\[\]]*)\s+(\w+)\s*[;=]'
    )
    for m in field_pattern.finditer(code):
        api["fields"].append(f"{m.group(1)} {m.group(2)}")

    return api


def compute_semantic_preservation(original: str, refactored: str) -> Dict:
    """Measure how much of the public API surface is preserved."""
    orig_api = _extract_public_api(original)
    ref_api = _extract_public_api(refactored)

    def set_preservation(before: List[str], after: List[str]) -> Dict:
        b = set(before)
        a = set(after)
        preserved = b & a
        removed = b - a
        added = a - b
        rate = round(len(preserved) / max(1, len(b)) * 100, 1)
        return {
            "total_before": len(b),
            "total_after": len(a),
            "preserved": len(preserved),
            "removed": len(removed),
            "added": len(added),
            "preservation_rate": rate,
            "removed_items": sorted(list(removed))[:10],
            "added_items": sorted(list(added))[:10],
        }

    classes = set_preservation(orig_api["classes"], ref_api["classes"])
    methods = set_preservation(orig_api["methods"], ref_api["methods"])
    fields = set_preservation(orig_api["fields"], ref_api["fields"])

    total_before = classes["total_before"] + methods["total_before"] + fields["total_before"]
    total_preserved = classes["preserved"] + methods["preserved"] + fields["preserved"]
    overall_rate = round(total_preserved / max(1, total_before) * 100, 1)

    return {
        "overall_preservation_rate": overall_rate,
        "classes": classes,
        "methods": methods,
        "fields": fields,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Token Efficiency
# ═══════════════════════════════════════════════════════════════════════════

def compute_token_efficiency(original: str, refactored: str,
                             token_usage: Optional[Dict] = None) -> Dict:
    """Compute how efficiently LLM tokens were used relative to meaningful changes."""
    diff = compute_diff_churn(original, refactored)
    meaningful_changes = diff["total_changes"]

    total_tokens = 0
    prompt_tokens = 0
    completion_tokens = 0
    cost = 0.0

    if token_usage:
        total_tokens = token_usage.get("total_tokens", 0)
        prompt_tokens = token_usage.get("prompt_tokens", 0)
        completion_tokens = token_usage.get("completion_tokens", 0)
        cost = token_usage.get("cost", 0.0)

    changes_per_token = round(meaningful_changes / max(1, total_tokens) * 1000, 2) if total_tokens else 0.0
    cost_per_change = round(cost / max(1, meaningful_changes), 6) if cost else 0.0

    return {
        "total_tokens": total_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_usd": round(cost, 6),
        "meaningful_line_changes": meaningful_changes,
        "changes_per_1k_tokens": changes_per_token,
        "cost_per_change_usd": cost_per_change,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Smell Resolution Rate by Type
# ═══════════════════════════════════════════════════════════════════════════

def compute_smell_resolution_by_type(
    before_smells: List[Dict],
    after_smells: List[Dict],
) -> Dict:
    """Compute per-smell-type resolution rates."""
    before_by_type: Dict[str, int] = {}
    after_by_type: Dict[str, int] = {}

    for s in before_smells:
        t = s.get("type") or s.get("smell") or "Unknown"
        before_by_type[t] = before_by_type.get(t, 0) + 1

    for s in after_smells:
        t = s.get("type") or s.get("smell") or "Unknown"
        after_by_type[t] = after_by_type.get(t, 0) + 1

    all_types = set(list(before_by_type.keys()) + list(after_by_type.keys()))

    resolution = {}
    total_resolved = 0
    total_before = 0

    for t in sorted(all_types):
        b = before_by_type.get(t, 0)
        a = after_by_type.get(t, 0)
        reduced = b - a
        rate = round(max(0, reduced) / max(1, b) * 100, 1) if b > 0 else 0.0
        resolution[t] = {
            "before": b,
            "after": a,
            "resolved": max(0, reduced),
            "introduced": max(0, a - b),
            "net_change": a - b,
            "resolution_rate": rate,
        }
        total_resolved += max(0, reduced)
        total_before += b

    overall_rate = round(total_resolved / max(1, total_before) * 100, 1)

    return {
        "by_type": resolution,
        "total_before": total_before,
        "total_after": sum(after_by_type.values()),
        "total_resolved": total_resolved,
        "overall_resolution_rate": overall_rate,
        "types_fully_eliminated": sum(1 for t in resolution.values() if t["after"] == 0 and t["before"] > 0),
        "types_with_regression": sum(1 for t in resolution.values() if t["net_change"] > 0),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Quick test
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    sample = """
    package org.example;

    import java.util.List;
    import java.util.ArrayList;
    import java.util.Map;
    import java.util.HashMap;

    public class Calculator {
        private List<Double> history = new ArrayList<>();
        private Map<String, Double> constants = new HashMap<>();
        private String name;

        public Calculator(String name) {
            this.name = name;
            constants.put("PI", 3.14159);
            constants.put("E", 2.71828);
        }

        public double add(double a, double b) {
            double result = a + b;
            history.add(result);
            return result;
        }

        public double multiply(double a, double b) {
            double result = a * b;
            history.add(result);
            return result;
        }

        public double complexCalculation(double x) {
            if (x > 0) {
                if (x > 100) {
                    for (int i = 0; i < 10; i++) {
                        x = x * 0.9;
                    }
                } else {
                    while (x < 50) {
                        x = x * 1.1;
                    }
                }
            }
            return x;
        }

        public List<Double> getHistory() {
            return history;
        }

        public String getName() {
            return name;
        }
    }
    """

    import json
    result = compute_all_metrics(sample)
    print(json.dumps(result, indent=2, default=str))
