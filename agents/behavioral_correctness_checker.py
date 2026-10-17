#!/usr/bin/env python3
"""
Behavioral Correctness Checker for Refactored Code

This module detects behavioral changes that can break semantic guarantees,
exception handling, framework contracts, and API expectations.

Based on observations:
- Logic decomposed into helper methods can lose exception handling
- Assumptions made that methods always throw (e.g., fail())
- API contracts violated (wrong method signatures, constructor handling)
- Conditional logic lost (e.g., setName() should be called)
"""

import re
from typing import Dict, List, Set, Tuple, Optional

from smell_prioritizer import build_public_api_signature

class BehavioralCorrectnessChecker:
    """Checks for behavioral changes in refactored code."""
    
    def __init__(self):
        self.warnings = []
        self.errors = []
        self.behavioral_changes = []
    
    def check_behavioral_correctness(self, original: str, refactored: str, file_path: str = None) -> Dict:
        """
        Comprehensive behavioral correctness check.
        
        Returns:
            Dict with:
            - behavioral_correct: bool
            - method_signatures_preserved: bool
            - exception_handling_preserved: bool
            - framework_contracts_preserved: bool
            - conditional_logic_preserved: bool
            - warnings: List[str]
            - errors: List[str]
            - behavioral_changes: List[Dict]
        """
        results = {
            "behavioral_correct": True,
            "method_signatures_preserved": True,
            "exception_handling_preserved": True,
            "framework_contracts_preserved": True,
            "conditional_logic_preserved": True,
            "warnings": [],
            "errors": [],
            "behavioral_changes": []
        }
        
        # 1. Check method signatures
        sig_check = self._check_method_signatures(original, refactored)
        results["method_signatures_preserved"] = sig_check["preserved"]
        results["warnings"].extend(sig_check.get("warnings", []))
        results["errors"].extend(sig_check.get("errors", []))
        results["behavioral_changes"].extend(sig_check.get("changes", []))
        
        # 2. Check exception handling
        exception_check = self._check_exception_handling(original, refactored)
        results["exception_handling_preserved"] = exception_check["preserved"]
        results["warnings"].extend(exception_check.get("warnings", []))
        results["errors"].extend(exception_check.get("errors", []))
        results["behavioral_changes"].extend(exception_check.get("changes", []))
        
        # 3. Check framework contracts
        framework_check = self._check_framework_contracts(original, refactored, file_path)
        results["framework_contracts_preserved"] = framework_check["preserved"]
        results["warnings"].extend(framework_check.get("warnings", []))
        results["errors"].extend(framework_check.get("errors", []))
        results["behavioral_changes"].extend(framework_check.get("changes", []))
        
        # 4. Check conditional logic
        conditional_check = self._check_conditional_logic(original, refactored)
        results["conditional_logic_preserved"] = conditional_check["preserved"]
        results["warnings"].extend(conditional_check.get("warnings", []))
        results["errors"].extend(conditional_check.get("errors", []))
        results["behavioral_changes"].extend(conditional_check.get("changes", []))
        
        # 5. Check for method call changes (e.g., fail() assumptions)
        method_call_check = self._check_method_call_changes(original, refactored)
        results["warnings"].extend(method_call_check.get("warnings", []))
        results["errors"].extend(method_call_check.get("errors", []))
        results["behavioral_changes"].extend(method_call_check.get("changes", []))
        results["critical_method_calls_preserved"] = (
            len(method_call_check.get("errors", [])) == 0
            and not any(c.get("severity") == "error" for c in method_call_check.get("changes", []))
        )
        
        # Overall assessment
        results["behavioral_correct"] = (
            results["method_signatures_preserved"] and
            results["exception_handling_preserved"] and
            results["framework_contracts_preserved"] and
            results["conditional_logic_preserved"] and
            results["critical_method_calls_preserved"] and
            len(results["errors"]) == 0
        )
        
        return results
    
    def _check_method_signatures(self, original: str, refactored: str) -> Dict:
        """Check if public method signatures are preserved (same as verify gate)."""
        results = {
            "preserved": True,
            "warnings": [],
            "errors": [],
            "changes": []
        }

        original_public = set(build_public_api_signature(original))
        refactored_public = set(build_public_api_signature(refactored))

        removed = original_public - refactored_public
        if removed:
            results["preserved"] = False
            for sig in sorted(removed):
                results["errors"].append(f"Public method removed: {sig}")
                results["changes"].append({
                    "type": "method_removed",
                    "signature": sig,
                    "severity": "error"
                })

        added = refactored_public - original_public
        for sig in sorted(added):
            results["warnings"].append(f"New public method added: {sig}")
            results["changes"].append({
                "type": "method_added",
                "signature": sig,
                "severity": "warning"
            })
        if added and results["preserved"]:
            # New public API surface — warn but do not fail if nothing was removed
            pass

        return results
    
    def _check_exception_handling(self, original: str, refactored: str) -> Dict:
        """Check if exception handling is preserved."""
        results = {
            "preserved": True,
            "warnings": [],
            "errors": [],
            "changes": []
        }
        
        # Count exception handling constructs
        original_try_catch = len(re.findall(r'\btry\s*\{', original))
        refactored_try_catch = len(re.findall(r'\btry\s*\{', refactored))
        
        original_catch = len(re.findall(r'\bcatch\s*\(', original))
        refactored_catch = len(re.findall(r'\bcatch\s*\(', refactored))
        
        original_throws = len(re.findall(r'\bthrows\s+\w+', original))
        refactored_throws = len(re.findall(r'\bthrows\s+\w+', refactored))
        
        orig_handlers = original_try_catch + original_catch + original_throws
        ref_handlers = refactored_try_catch + refactored_catch + refactored_throws
        original_helper_methods = len(re.findall(r'private\s+\w+\s+\w+\s*\([^)]*\)\s*\{', original))
        refactored_helper_methods = len(re.findall(r'private\s+\w+\s+\w+\s*\([^)]*\)\s*\{', refactored))

        # Extract Method often moves try/catch into helpers — allow if total handling is not reduced
        if ref_handlers >= orig_handlers:
            return results

        # Check for removed exception handling
        if original_try_catch > refactored_try_catch:
            removed = original_try_catch - refactored_try_catch
            results["preserved"] = False
            results["warnings"].append(f"Try-catch blocks removed: {removed}")
            results["changes"].append({
                "type": "exception_handling_removed",
                "count": removed,
                "severity": "warning"
            })

        if original_catch > refactored_catch:
            removed = original_catch - refactored_catch
            if refactored_helper_methods <= original_helper_methods:
                results["preserved"] = False
            results["warnings"].append(f"Catch blocks removed: {removed}")
            results["changes"].append({
                "type": "catch_blocks_removed",
                "count": removed,
                "severity": "warning"
            })

        if original_throws > refactored_throws:
            removed = original_throws - refactored_throws
            results["preserved"] = False
            results["warnings"].append(f"Throws declarations removed: {removed}")
            results["changes"].append({
                "type": "throws_removed",
                "count": removed,
                "severity": "warning"
            })

        if refactored_helper_methods > original_helper_methods and original_catch > refactored_catch:
            results["warnings"].append(
                "Exception handling may have been moved to helper methods - verify exception propagation"
            )
            results["changes"].append({
                "type": "exception_handling_moved",
                "severity": "warning"
            })
        
        return results
    
    def _check_framework_contracts(self, original: str, refactored: str, file_path: str = None) -> Dict:
        """Check for framework contract violations."""
        results = {
            "preserved": True,
            "warnings": [],
            "errors": [],
            "changes": []
        }
        
        # Common framework patterns to check
        
        # 1. Check for setName() calls (JUnit framework)
        original_setName = len(re.findall(r'\.setName\s*\(', original))
        refactored_setName = len(re.findall(r'\.setName\s*\(', refactored))
        
        if original_setName > refactored_setName:
            removed = original_setName - refactored_setName
            results["preserved"] = False
            results["errors"].append(f"setName() calls removed: {removed} - may break framework expectations")
            results["changes"].append({
                "type": "framework_call_removed",
                "method": "setName",
                "count": removed,
                "severity": "error"
            })
        
        # 2. Check for constructor handling changes
        original_constructors = len(re.findall(r'public\s+\w+\s*\([^)]*\)\s*\{', original))
        refactored_constructors = len(re.findall(r'public\s+\w+\s*\([^)]*\)\s*\{', refactored))
        
        if original_constructors != refactored_constructors:
            results["preserved"] = False
            results["warnings"].append(
                f"Constructor count changed: {original_constructors} → {refactored_constructors}"
            )
            results["changes"].append({
                "type": "constructor_changed",
                "original": original_constructors,
                "refactored": refactored_constructors,
                "severity": "warning"
            })
        
        # 3. Check for @Override annotations (framework contracts)
        original_override = len(re.findall(r'@Override', original))
        refactored_override = len(re.findall(r'@Override', refactored))
        
        if original_override > refactored_override:
            removed = original_override - refactored_override
            results["preserved"] = False
            results["warnings"].append(f"@Override annotations removed: {removed}")
            results["changes"].append({
                "type": "override_annotation_removed",
                "count": removed,
                "severity": "warning"
            })
        
        # 4. Check for test annotations (JUnit)
        original_test_annotations = len(re.findall(r'@Test\b', original))
        refactored_test_annotations = len(re.findall(r'@Test\b', refactored))
        
        if original_test_annotations > refactored_test_annotations:
            removed = original_test_annotations - refactored_test_annotations
            results["preserved"] = False
            results["errors"].append(f"@Test annotations removed: {removed} - breaks test framework")
            results["changes"].append({
                "type": "test_annotation_removed",
                "count": removed,
                "severity": "error"
            })
        
        return results
    
    def _check_conditional_logic(self, original: str, refactored: str) -> Dict:
        """Check if conditional logic is preserved."""
        results = {
            "preserved": True,
            "warnings": [],
            "errors": [],
            "changes": []
        }
        
        # Count conditional constructs
        original_ifs = len(re.findall(r'\bif\s*\(', original))
        refactored_ifs = len(re.findall(r'\bif\s*\(', refactored))
        
        original_ternary = len(re.findall(r'\?[^:]*:', original))
        refactored_ternary = len(re.findall(r'\?[^:]*:', refactored))
        
        original_switch = len(re.findall(r'\bswitch\s*\(', original))
        refactored_switch = len(re.findall(r'\bswitch\s*\(', refactored))
        
        # Check for removed conditionals
        if original_ifs > refactored_ifs:
            removed = original_ifs - refactored_ifs
            results["preserved"] = False
            results["warnings"].append(f"If statements removed: {removed} - may lose conditional logic")
            results["changes"].append({
                "type": "conditional_removed",
                "construct": "if",
                "count": removed,
                "severity": "warning"
            })
        
        if original_ternary > refactored_ternary:
            removed = original_ternary - refactored_ternary
            results["preserved"] = False
            results["warnings"].append(f"Ternary operators removed: {removed}")
            results["changes"].append({
                "type": "conditional_removed",
                "construct": "ternary",
                "count": removed,
                "severity": "warning"
            })
        
        if original_switch > refactored_switch:
            removed = original_switch - refactored_switch
            results["preserved"] = False
            results["warnings"].append(f"Switch statements removed: {removed}")
            results["changes"].append({
                "type": "conditional_removed",
                "construct": "switch",
                "count": removed,
                "severity": "warning"
            })
        
        return results
    
    def _check_method_call_changes(self, original: str, refactored: str) -> Dict:
        """Check for problematic method call changes (e.g., fail() assumptions)."""
        results = {
            "warnings": [],
            "errors": [],
            "changes": []
        }
        
        # Check for fail() method calls (common in JUnit)
        original_fail = len(re.findall(r'\.fail\s*\(', original))
        refactored_fail = len(re.findall(r'\.fail\s*\(', refactored))
        
        if original_fail > refactored_fail:
            removed = original_fail - refactored_fail
            results["warnings"].append(
                f"fail() calls removed: {removed} - verify this doesn't break test expectations"
            )
            results["changes"].append({
                "type": "method_call_removed",
                "method": "fail",
                "count": removed,
                "severity": "warning"
            })
        
        # Check for assert calls
        original_assert = len(re.findall(r'assert\w+\s*\(', original))
        refactored_assert = len(re.findall(r'assert\w+\s*\(', refactored))
        
        if original_assert > refactored_assert:
            removed = original_assert - refactored_assert
            results["warnings"].append(f"Assert calls removed: {removed}")
            results["changes"].append({
                "type": "assert_removed",
                "count": removed,
                "severity": "warning"
            })
        
        return results
    
    def _extract_method_signatures(self, code: str) -> Set[str]:
        """Extract method signatures from code."""
        signatures = set()
        
        # Match method declarations
        pattern = r'(public|private|protected)?\s*(static\s+)?\s*(\w+)\s+(\w+)\s*\([^)]*\)'
        matches = re.finditer(pattern, code)
        
        for match in matches:
            sig = match.group(0).strip()
            signatures.add(sig)
        
        return signatures
    
    def _extract_method_name(self, signature: str) -> str:
        """Extract method name from signature."""
        match = re.search(r'(\w+)\s*\(', signature)
        if match:
            return match.group(1)
        return ""


def check_behavioral_correctness(original: str, refactored: str, file_path: str = None) -> Dict:
    """
    Main function to check behavioral correctness.
    
    Args:
        original: Original code
        refactored: Refactored code
        file_path: Optional file path for context
    
    Returns:
        Behavioral correctness report
    """
    checker = BehavioralCorrectnessChecker()
    return checker.check_behavioral_correctness(original, refactored, file_path)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python3 behavioral_correctness_checker.py <original_file> <refactored_file> [file_path]")
        sys.exit(1)
    
    with open(sys.argv[1], 'r') as f:
        original = f.read()
    
    with open(sys.argv[2], 'r') as f:
        refactored = f.read()
    
    file_path = sys.argv[3] if len(sys.argv) > 3 else None
    
    report = check_behavioral_correctness(original, refactored, file_path)
    
    import json
    print(json.dumps(report, indent=2))

