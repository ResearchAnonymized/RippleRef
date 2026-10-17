#!/usr/bin/env python3
"""
Comprehensive Refactoring Analysis and Reporting

Provides detailed analysis of refactoring results including:
1. What was improved (code smells, metrics, structure)
2. Behavioral correctness (method signatures, exceptions, contracts)
3. Test results (if available)
4. Refactoring practices applied
"""

import re
from typing import Dict, List, Optional, Set
from behavioral_correctness_checker import BehavioralCorrectnessChecker
import code_metrics


class RefactoringAnalyzer:
    """Comprehensive analysis of refactoring results."""
    
    def __init__(self):
        self.behavioral_checker = BehavioralCorrectnessChecker()
    
    def analyze_refactoring(
        self,
        original: str,
        refactored: str,
        original_smells: List[Dict],
        refactored_smells: List[Dict],
        file_path: str = None,
        token_usage: Optional[Dict] = None,
        retry_count: int = 0,
    ) -> Dict:
        """
        Comprehensive refactoring analysis.
        
        Returns detailed report with:
        - Improvements (smells, metrics, structure)
        - Behavioral correctness
        - Refactoring practices applied
        - Research-grade metrics (Halstead, coupling, cohesion, etc.)
        """
        report = {
            "summary": {},
            "improvements": {},
            "behavioral_correctness": {},
            "refactoring_practices": {},
            "test_results": {},
            "metrics": {},
            "smell_resolution": {},
            "pipeline_metadata": {
                "retry_count": retry_count,
            },
            "warnings": [],
            "errors": []
        }
        
        # CRITICAL CHECK: Detect identical code immediately
        import re
        original_normalized = re.sub(r'\s+', ' ', original.strip())
        refactored_normalized = re.sub(r'\s+', ' ', refactored.strip())
        
        if original.strip() == refactored.strip() or original_normalized == refactored_normalized:
            # Code is identical - return clear rejection report
            report["summary"] = {
                "refactoring_successful": False,
                "overall_score": 0.0,
                "key_achievements": [],
                "concerns": [
                    "❌ NO REFACTORING OCCURRED: Refactored code is identical to original code",
                    "The LLM returned the same code without making any structural changes",
                    "This indicates the refactoring attempt failed or was skipped"
                ]
            }
            report["improvements"] = {
                "code_smells": {
                    "before": len(original_smells),
                    "after": len(refactored_smells),
                    "reduced": 0,
                    "improvement_percent": 0.0,
                    "smells_removed": [],
                    "smells_added": []
                },
                "structural_changes": {
                    "methods_extracted": 0,
                    "methods_renamed": 0,
                    "classes_split": 0,
                    "duplicate_code_removed": False,
                    "naming_improved": False
                },
                "complexity": {
                    "before": 0,
                    "after": 0,
                    "improved": False
                }
            }
            report["behavioral_correctness"] = {
                "behavioral_correct": True,  # Technically correct since nothing changed
                "method_signatures_preserved": True,
                "exception_handling_preserved": True,
                "framework_contracts_preserved": True,
                "conditional_logic_preserved": True,
                "critical_method_calls_preserved": True,
                "note": "No changes detected - behavior preserved by default"
            }
            report["refactoring_practices"] = {
                "extract_method": False,
                "extract_class": False,
                "rename_method": False,
                "rename_variable": False,
                "extract_constant": False,
                "remove_duplication": False,
                "simplify_conditional": False,
                "decompose_conditional": False,
                "practices_applied": [],
                "note": "No refactoring practices applied - code is identical"
            }
            report["metrics"] = {
                "complexity": {"before": 0, "after": 0, "improved": False},
                "maintainability": {"before": 0, "after": 0, "improved": False},
                "testability": {"before": 0, "after": 0, "improved": False}
            }
            report["warnings"].append("Refactored code is identical to original - no refactoring occurred")
            return report
        
        # 1. Calculate improvements
        report["improvements"] = self._analyze_improvements(
            original, refactored, original_smells, refactored_smells
        )
        
        # 2. Check behavioral correctness
        report["behavioral_correctness"] = self.behavioral_checker.check_behavioral_correctness(
            original, refactored, file_path
        )
        
        # 3. Identify refactoring practices applied
        report["refactoring_practices"] = self._identify_practices(original, refactored)
        
        # 4. Calculate quality metrics (including comprehensive research metrics)
        report["metrics"] = self._calculate_metrics(original, refactored, token_usage)
        
        # 5. Smell resolution rate by type
        report["smell_resolution"] = code_metrics.compute_smell_resolution_by_type(
            original_smells, refactored_smells
        )
        
        # 6. Generate summary
        report["summary"] = self._generate_summary(report)
        
        return report
    
    def _analyze_improvements(
        self,
        original: str,
        refactored: str,
        original_smells: List[Dict],
        refactored_smells: List[Dict]
    ) -> Dict:
        """Analyze what was improved."""
        improvements = {
            "code_smells": {
                "before": len(original_smells),
                "after": len(refactored_smells),
                "reduced": len(original_smells) - len(refactored_smells),
                "improvement_percent": 0.0,
                "smells_removed": [],
                "smells_added": []
            },
            "structural_changes": {
                "methods_extracted": 0,
                "methods_renamed": 0,
                "classes_split": 0,
                "duplicate_code_removed": False,
                "naming_improved": False
            },
            "complexity": {
                "before": 0,
                "after": 0,
                "improved": False
            }
        }
        
        # Calculate smell improvement
        if len(original_smells) > 0:
            improvements["code_smells"]["improvement_percent"] = (
                (len(original_smells) - len(refactored_smells)) / len(original_smells) * 100
            )
        
        # Find removed smells
        original_smell_ids = {s.get('detectorId', s.get('type', '')) for s in original_smells}
        refactored_smell_ids = {s.get('detectorId', s.get('type', '')) for s in refactored_smells}
        improvements["code_smells"]["smells_removed"] = list(original_smell_ids - refactored_smell_ids)
        improvements["code_smells"]["smells_added"] = list(refactored_smell_ids - original_smell_ids)
        
        # Detect structural changes
        original_methods = self._extract_method_names(original)
        refactored_methods = self._extract_method_names(refactored)
        
        new_methods = refactored_methods - original_methods
        removed_methods = original_methods - refactored_methods
        
        improvements["structural_changes"]["methods_extracted"] = len(new_methods)
        improvements["structural_changes"]["methods_renamed"] = len([
            m for m in original_methods if m.lower() in [rm.lower() for rm in removed_methods]
        ])
        
        # Check for class splitting
        original_classes = len(re.findall(r'\b(public|private|protected)?\s+class\s+\w+', original))
        refactored_classes = len(re.findall(r'\b(public|private|protected)?\s+class\s+\w+', refactored))
        improvements["structural_changes"]["classes_split"] = max(0, refactored_classes - original_classes)
        
        # Check for duplicate code removal (simplified - look for extracted helper methods)
        improvements["structural_changes"]["duplicate_code_removed"] = len(new_methods) > 0
        
        # Check for naming improvements
        improvements["structural_changes"]["naming_improved"] = self._check_naming_improvements(original, refactored)
        
        return improvements
    
    def _identify_practices(self, original: str, refactored: str) -> Dict:
        """Identify refactoring practices/patterns applied."""
        practices = {
            "extract_method": False,
            "extract_class": False,
            "rename_method": False,
            "rename_variable": False,
            "extract_constant": False,
            "remove_duplication": False,
            "simplify_conditional": False,
            "decompose_conditional": False,
            "practices_applied": []
        }
        
        # Extract Method
        original_methods = self._extract_method_names(original)
        refactored_methods = self._extract_method_names(refactored)
        if len(refactored_methods) > len(original_methods):
            practices["extract_method"] = True
            practices["practices_applied"].append("Extract Method")
        
        # Extract Class
        original_classes = len(re.findall(r'\bclass\s+\w+', original))
        refactored_classes = len(re.findall(r'\bclass\s+\w+', refactored))
        if refactored_classes > original_classes:
            practices["extract_class"] = True
            practices["practices_applied"].append("Extract Class")
        
        # Rename Method
        if practices["extract_method"] or len(original_methods & refactored_methods) < len(original_methods):
            practices["rename_method"] = True
            practices["practices_applied"].append("Rename Method")
        
        # Rename Variable (check for variable name changes)
        if self._check_variable_renames(original, refactored):
            practices["rename_variable"] = True
            practices["practices_applied"].append("Rename Variable")
        
        # Extract Constant
        original_constants = len(re.findall(r'\b(public|private|protected)?\s+static\s+final\s+\w+', original))
        refactored_constants = len(re.findall(r'\b(public|private|protected)?\s+static\s+final\s+\w+', refactored))
        if refactored_constants > original_constants:
            practices["extract_constant"] = True
            practices["practices_applied"].append("Extract Constant")
        
        # Remove Duplication
        if practices["extract_method"]:
            practices["remove_duplication"] = True
            practices["practices_applied"].append("Remove Duplication")
        
        # Simplify/Decompose Conditional
        if self._check_conditional_simplification(original, refactored):
            practices["simplify_conditional"] = True
            practices["practices_applied"].append("Simplify Conditional")
        
        return practices
    
    def _calculate_metrics(self, original: str, refactored: str,
                           token_usage: Optional[Dict] = None) -> Dict:
        """Calculate quality metrics including comprehensive research metrics."""
        def calc_complexity(code: str) -> int:
            complexity = 1
            complexity += len(re.findall(r'\bif\s*\(', code))
            complexity += len(re.findall(r'\bwhile\s*\(', code))
            complexity += len(re.findall(r'\bfor\s*\(', code))
            complexity += len(re.findall(r'\bswitch\s*\(', code))
            complexity += len(re.findall(r'\bcatch\s*\(', code))
            return complexity
        
        def calc_maintainability(code: str) -> float:
            lines = len(code.splitlines())
            methods = len(re.findall(r'\b(public|private|protected)?\s+\w+\s+\w+\s*\(', code))
            complexity = calc_complexity(code)
            if lines == 0:
                return 0.0
            maintainability = 100.0
            maintainability -= min(50, lines / 10)
            maintainability -= min(30, complexity * 2)
            maintainability += min(20, methods * 0.5)
            return max(0.0, min(100.0, maintainability))
        
        original_complexity = calc_complexity(original)
        refactored_complexity = calc_complexity(refactored)
        
        original_maintainability = calc_maintainability(original)
        refactored_maintainability = calc_maintainability(refactored)

        comprehensive = code_metrics.compute_before_after(original, refactored, token_usage)
        
        return {
            "complexity": {
                "before": original_complexity,
                "after": refactored_complexity,
                "change": refactored_complexity - original_complexity,
                "improved": refactored_complexity < original_complexity
            },
            "maintainability": {
                "before": round(original_maintainability, 1),
                "after": round(refactored_maintainability, 1),
                "change": round(refactored_maintainability - original_maintainability, 1),
                "improved": refactored_maintainability > original_maintainability
            },
            "lines_of_code": {
                "before": len(original.splitlines()),
                "after": len(refactored.splitlines()),
                "change": len(refactored.splitlines()) - len(original.splitlines())
            },
            "methods": {
                "before": len(re.findall(r'\b(public|private|protected)?\s+\w+\s+\w+\s*\(', original)),
                "after": len(re.findall(r'\b(public|private|protected)?\s+\w+\s+\w+\s*\(', refactored)),
                "change": len(re.findall(r'\b(public|private|protected)?\s+\w+\s+\w+\s*\(', refactored)) - 
                           len(re.findall(r'\b(public|private|protected)?\s+\w+\s+\w+\s*\(', original))
            },
            "halstead": comprehensive["halstead"],
            "method_lengths": comprehensive["method_lengths"],
            "nesting_depth": comprehensive["nesting_depth"],
            "coupling": comprehensive["coupling"],
            "cohesion": comprehensive["cohesion"],
            "diff_churn": comprehensive["diff_churn"],
            "semantic_preservation": comprehensive["semantic_preservation"],
            "token_efficiency": comprehensive["token_efficiency"],
        }
    
    def _generate_summary(self, report: Dict) -> Dict:
        """Generate executive summary with strict scoring."""
        improvements = report["improvements"]
        behavioral = report["behavioral_correctness"]
        practices = report["refactoring_practices"]
        metrics = report["metrics"]

        summary = {
            "refactoring_successful": True,
            "overall_score": 0.0,
            "key_achievements": [],
            "concerns": []
        }

        score = 0.0

        # --- Behavioral correctness (35 points — MOST important, scored FIRST) ---
        behavioral_score = 0
        behavioral_checks = [
            ("method_signatures_preserved", 12, "Method signatures preserved"),
            ("exception_handling_preserved", 8, "Exception handling preserved"),
            ("framework_contracts_preserved", 8, "Framework contracts preserved"),
            ("conditional_logic_preserved", 4, "Conditional logic preserved"),
            ("critical_method_calls_preserved", 3, "Critical method calls preserved"),
        ]
        behavioral_failures = 0
        for key, points, desc in behavioral_checks:
            if behavioral.get(key, True):
                behavioral_score += points
            else:
                behavioral_failures += 1
                summary["concerns"].append(f"{desc.replace('preserved', 'changed')}")
        score += behavioral_score
        if behavioral["behavioral_correct"]:
            summary["key_achievements"].append("Behavioral correctness fully preserved")

        # --- Code smell improvement (30 points) ---
        reduced = improvements["code_smells"]["reduced"]
        before_smells = improvements["code_smells"]["before"]
        pct = improvements["code_smells"]["improvement_percent"]
        if reduced > 0:
            score += min(30, pct / 100 * 30)
            summary["key_achievements"].append(
                f"Reduced code smells by {reduced} ({pct:.1f}%)"
            )
        elif reduced == 0 and before_smells > 0:
            score += 5
            summary["key_achievements"].append("Code smell count maintained (no regression)")
        elif reduced < 0 and before_smells > 0:
            increase_pct = abs(reduced) / max(1, before_smells) * 100
            if increase_pct <= 3:
                score += 2
                summary["key_achievements"].append(f"Smell count change within noise margin ({increase_pct:.0f}%)")
            else:
                # Penalty: smells increased
                penalty = min(15, increase_pct / 5)
                score -= penalty
                summary["concerns"].append(f"Code smells increased by {abs(reduced)} ({increase_pct:.0f}%)")

        # --- Structural changes (20 points, but HALVED if behavioral checks failed) ---
        structural_score = 0
        if improvements["structural_changes"]["methods_extracted"] > 0:
            structural_score += 8
            summary["key_achievements"].append(
                f"Extracted {improvements['structural_changes']['methods_extracted']} new methods"
            )
        if improvements["structural_changes"]["classes_split"] > 0:
            structural_score += 6
            summary["key_achievements"].append(
                f"Split into {improvements['structural_changes']['classes_split']} additional classes"
            )
        if improvements["structural_changes"]["duplicate_code_removed"]:
            structural_score += 4
            summary["key_achievements"].append("Removed duplicate code")
        if improvements["structural_changes"]["naming_improved"]:
            structural_score += 2
        structural_score = min(20, structural_score)
        # If behavior was broken, structural changes are worth much less
        if behavioral_failures >= 2:
            structural_score = structural_score // 3
        elif behavioral_failures == 1:
            structural_score = structural_score * 2 // 3
        score += structural_score

        # --- Quality metrics (10 points) ---
        if metrics["complexity"]["improved"]:
            score += 5
            summary["key_achievements"].append(
                f"Reduced complexity from {metrics['complexity']['before']} to {metrics['complexity']['after']}"
            )
        elif metrics["complexity"]["before"] == metrics["complexity"]["after"]:
            score += 2
        if metrics["maintainability"]["improved"]:
            score += 5
            summary["key_achievements"].append(
                f"Improved maintainability from {metrics['maintainability']['before']} to {metrics['maintainability']['after']}"
            )
        elif metrics["maintainability"]["before"] == metrics["maintainability"]["after"]:
            score += 2

        # --- Refactoring practices (5 points) ---
        if len(practices["practices_applied"]) > 0:
            score += min(5, len(practices["practices_applied"]) * 1.25)
            summary["key_achievements"].append(
                f"Applied {len(practices['practices_applied'])} refactoring practices: {', '.join(practices['practices_applied'][:3])}"
            )

        # Ensure score can't go below 0
        score = max(0.0, score)

        summary["overall_score"] = round(min(100, score), 1)
        strong_smell_win = reduced > 0 and (pct >= 50 or reduced >= 2)
        # Successful when smells improved and score is reasonable; allow minor heuristic warnings after Extract Method
        summary["refactoring_successful"] = (
            summary["overall_score"] >= 40
            and reduced >= -3
            and (
                behavioral_failures == 0
                or (strong_smell_win and behavioral_failures <= 2)
            )
        )
        
        return summary
    
    def _extract_method_names(self, code: str) -> Set[str]:
        """Extract method names from code."""
        methods = set()
        matches = re.findall(r'\b(public|private|protected)?\s+\w+\s+(\w+)\s*\(', code)
        for match in matches:
            methods.add(match[1])
        return methods
    
    def _check_naming_improvements(self, original: str, refactored: str) -> bool:
        """Check if naming was improved."""
        # Simple check: look for more descriptive variable names
        original_vars = set(re.findall(r'\b([a-z][a-zA-Z0-9]*)\s*=', original))
        refactored_vars = set(re.findall(r'\b([a-z][a-zA-Z0-9]*)\s*=', refactored))
        
        # If refactored has longer/more descriptive variable names
        avg_original_len = sum(len(v) for v in original_vars) / max(1, len(original_vars))
        avg_refactored_len = sum(len(v) for v in refactored_vars) / max(1, len(refactored_vars))
        
        return avg_refactored_len > avg_original_len * 1.1
    
    def _check_variable_renames(self, original: str, refactored: str) -> bool:
        """Check if variables were renamed."""
        original_vars = set(re.findall(r'\b([a-z][a-zA-Z0-9]*)\s*=', original))
        refactored_vars = set(re.findall(r'\b([a-z][a-zA-Z0-9]*)\s*=', refactored))
        
        # If there are variables in refactored that weren't in original
        return len(refactored_vars - original_vars) > 0
    
    def _check_conditional_simplification(self, original: str, refactored: str) -> bool:
        """Check if conditionals were simplified."""
        original_ifs = len(re.findall(r'\bif\s*\(', original))
        refactored_ifs = len(re.findall(r'\bif\s*\(', refactored))
        
        # If fewer if statements or extracted into methods
        return refactored_ifs < original_ifs

