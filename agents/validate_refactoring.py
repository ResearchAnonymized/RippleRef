#!/usr/bin/env python3
"""
Validation script for refactoring results.
Use this to verify refactoring quality for research purposes.
"""

import sys
import re
import json
from typing import Dict, List, Tuple

def calculate_metrics(code: str) -> Dict:
    """Calculate quality metrics from Java code."""
    if not code:
        return {"complexity": 0, "maintainability": 0, "testability": 0, "lines": 0, "methods": 0}
    
    lines = code.split('\n')
    code_lines = [l for l in lines if l.strip() and not l.strip().startswith('//') 
                  and not l.strip().startswith('/*') and not l.strip().startswith('*')]
    
    # Cyclomatic complexity
    complexity = 1
    complexity += len(re.findall(r'\bif\s*\(', code))
    complexity += len(re.findall(r'\bfor\s*\(', code))
    complexity += len(re.findall(r'\bwhile\s*\(', code))
    complexity += len(re.findall(r'\bswitch\s*\(', code))
    complexity += len(re.findall(r'\bcatch\s*\(', code))
    complexity += len(re.findall(r'\bcase\s+', code))
    complexity += len(re.findall(r'&&|\|\|', code))
    
    # Maintainability index
    import math
    loc = len(code_lines)
    if loc == 0:
        maintainability = 100.0
    else:
        halstead_volume = max(1, loc * complexity)
        mi = 171 - 5.2 * math.log(max(1, halstead_volume)) - 0.23 * complexity - 16.2 * math.log(max(1, loc))
        if mi > 100:
            maintainability = 100.0
        elif mi < 0:
            maintainability = max(0.0, 20.0 + (mi / 10.0))
        else:
            maintainability = mi
        maintainability = max(0.0, min(100.0, maintainability))
    
    # Testability
    method_count = len(re.findall(r'public\s+\w+\s+\w+\s*\(', code))
    private_methods = len(re.findall(r'private\s+\w+\s+\w+\s*\(', code))
    protected_methods = len(re.findall(r'protected\s+\w+\s+\w+\s*\(', code))
    total_methods = method_count + private_methods + protected_methods
    
    if total_methods == 0:
        testability = 0.0
    else:
        public_ratio = method_count / max(1, total_methods)
        complexity_penalty = complexity * 3
        method_bonus = min(50, total_methods * 5)
        testability = (public_ratio * 50) + method_bonus - complexity_penalty
        testability = max(0.0, min(100.0, testability))
    
    return {
        "complexity": complexity,
        "maintainability": round(maintainability, 1),
        "testability": round(testability, 1),
        "lines": loc,
        "methods": total_methods,
        "publicMethods": method_count
    }

def compare_refactoring(before: str, after: str) -> Dict:
    """Compare before and after refactoring."""
    metrics_before = calculate_metrics(before)
    metrics_after = calculate_metrics(after)
    
    # Check for actual changes
    before_normalized = re.sub(r'\s+', ' ', before.strip())
    after_normalized = re.sub(r'\s+', ' ', after.strip())
    is_different = before_normalized != after_normalized
    
    # Count actual code changes
    before_words = set(before_normalized.split())
    after_words = set(after_normalized.split())
    added_words = len(after_words - before_words)
    removed_words = len(before_words - after_words)
    
    # Check for compile errors (basic checks)
    compile_issues = []
    if 'builder.timeoutDuration' in after and 'builder.getTimeout()' not in after:
        compile_issues.append("Builder field accessed directly instead of using getter")
    if 'builder.timeoutUnit' in after and 'builder.getTimeUnit()' not in after:
        compile_issues.append("Builder field accessed directly instead of using getter")
    
    return {
        "isDifferent": is_different,
        "before": metrics_before,
        "after": metrics_after,
        "changes": {
            "complexity": metrics_after["complexity"] - metrics_before["complexity"],
            "maintainability": round(metrics_after["maintainability"] - metrics_before["maintainability"], 1),
            "testability": round(metrics_after["testability"] - metrics_before["testability"], 1),
            "lines": metrics_after["lines"] - metrics_before["lines"],
            "methods": metrics_after["methods"] - metrics_before["methods"]
        },
        "wordChanges": {
            "added": added_words,
            "removed": removed_words,
            "net": added_words - removed_words
        },
        "compileIssues": compile_issues,
        "improvement": {
            "complexityReduced": metrics_after["complexity"] < metrics_before["complexity"],
            "maintainabilityImproved": metrics_after["maintainability"] > metrics_before["maintainability"],
            "testabilityImproved": metrics_after["testability"] > metrics_before["testability"]
        }
    }

def validate_refactoring(before_file: str, after_file: str):
    """Validate refactoring by comparing two files."""
    try:
        with open(before_file, 'r') as f:
            before = f.read()
        with open(after_file, 'r') as f:
            after = f.read()
        
        result = compare_refactoring(before, after)
        
        print("=" * 60)
        print("REFACTORING VALIDATION REPORT")
        print("=" * 60)
        print(f"\n📊 QUALITY METRICS COMPARISON")
        print(f"{'Metric':<20} {'Before':<15} {'After':<15} {'Change':<15}")
        print("-" * 65)
        print(f"{'Complexity':<20} {result['before']['complexity']:<15} {result['after']['complexity']:<15} {result['changes']['complexity']:+.1f}")
        print(f"{'Maintainability':<20} {result['before']['maintainability']:<15.1f} {result['after']['maintainability']:<15.1f} {result['changes']['maintainability']:+.1f}")
        print(f"{'Testability':<20} {result['before']['testability']:<15.1f} {result['after']['testability']:<15.1f} {result['changes']['testability']:+.1f}")
        print(f"{'Lines of Code':<20} {result['before']['lines']:<15} {result['after']['lines']:<15} {result['changes']['lines']:+d}")
        print(f"{'Methods':<20} {result['before']['methods']:<15} {result['after']['methods']:<15} {result['changes']['methods']:+d}")
        
        print(f"\n✅ IMPROVEMENTS")
        improvements = []
        if result['improvement']['complexityReduced']:
            improvements.append(f"✓ Complexity reduced by {abs(result['changes']['complexity'])}")
        if result['improvement']['maintainabilityImproved']:
            improvements.append(f"✓ Maintainability improved by {result['changes']['maintainability']:.1f}")
        if result['improvement']['testabilityImproved']:
            improvements.append(f"✓ Testability improved by {result['changes']['testability']:.1f}")
        if not improvements:
            improvements.append("⚠ No clear improvements detected")
        for imp in improvements:
            print(f"  {imp}")
        
        print(f"\n🔍 CODE CHANGES")
        print(f"  Code is different: {'Yes' if result['isDifferent'] else 'No'}")
        print(f"  Words added: {result['wordChanges']['added']}")
        print(f"  Words removed: {result['wordChanges']['removed']}")
        print(f"  Net change: {result['wordChanges']['net']:+d} words")
        
        if result['compileIssues']:
            print(f"\n❌ COMPILE ISSUES DETECTED:")
            for issue in result['compileIssues']:
                print(f"  - {issue}")
        else:
            print(f"\n✅ No obvious compile issues detected")
        
        print("\n" + "=" * 60)
        print("VALIDATION COMPLETE")
        print("=" * 60)
        
        return result
        
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python validate_refactoring.py <before_file> <after_file>")
        sys.exit(1)
    
    validate_refactoring(sys.argv[1], sys.argv[2])

