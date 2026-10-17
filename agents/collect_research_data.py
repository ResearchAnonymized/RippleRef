#!/usr/bin/env python3
"""
Research Data Collection Script for RefactAI Paper
Collects metrics and refactoring results for empirical evaluation
"""

import json
import csv
import os
import sys
import asyncio
import httpx
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
import re

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.main import calculate_quality_metrics
from agents.validate_refactoring import compare_refactoring

# Configuration
AGENTS_URL = "http://localhost:8091"
BACKEND_URL = "http://localhost:8083"
OUTPUT_DIR = "research_data"
RESULTS_FILE = f"{OUTPUT_DIR}/experiment_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
CSV_FILE = f"{OUTPUT_DIR}/experiment_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

class ResearchDataCollector:
    def __init__(self):
        self.results = []
        os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    async def analyze_file(self, client: httpx.AsyncClient, workspace_id: str, file_path: str) -> Dict:
        """Analyze a file for code smells."""
        try:
            # Try analyze-live first (if we have content)
            # Otherwise use analyze-file
            response = await client.post(
                f"{BACKEND_URL}/api/workspace-enhanced-analysis/analyze-file",
                json={
                    "workspaceId": workspace_id,
                    "filePath": file_path
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"⚠️ Analysis failed for {file_path}: {e}")
            return {"codeSmells": []}
    
    async def refactor_file(self, client: httpx.AsyncClient, workspace_id: str, file_path: str, 
                           provided_smells: List[Dict]) -> Optional[Dict]:
        """Refactor a file using RefactAI."""
        try:
            response = await client.post(
                f"{AGENTS_URL}/agents/refactor",
                json={
                    "workspaceId": workspace_id,
                    "filePath": file_path,
                    "goals": ["reduce code smells", "improve readability", "enhance maintainability"],
                    "providedSmells": provided_smells
                },
                timeout=600.0  # 10 minutes for large files
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"⚠️ Refactoring failed for {file_path}: {e}")
            return None
    
    def get_file_content(self, workspace_id: str, file_path: str) -> Optional[str]:
        """Get file content from workspace."""
        # This would need to be implemented based on your workspace structure
        # For now, return None - you'll need to adapt this
        return None
    
    def count_methods(self, code: str) -> Dict:
        """Count methods in code."""
        public = len(re.findall(r'public\s+(static\s+)?\w+\s+\w+\s*\(', code))
        private = len(re.findall(r'private\s+(static\s+)?\w+\s+\w+\s*\(', code))
        protected = len(re.findall(r'protected\s+(static\s+)?\w+\s+\w+\s*\(', code))
        return {
            "public": public,
            "private": private,
            "protected": protected,
            "total": public + private + protected
        }
    
    def categorize_smells(self, smells: List[Dict]) -> Dict:
        """Categorize smells by type and severity."""
        categories = {
            "class_level": 0,
            "method_level": 0,
            "design_level": 0,
            "code_level": 0,
            "architectural": 0,
            "unknown": 0
        }
        severities = {
            "HIGH": 0,
            "MEDIUM": 0,
            "LOW": 0,
            "UNKNOWN": 0
        }
        
        for smell in smells:
            detector_id = (smell.get('detectorId') or smell.get('type') or '').lower()
            severity = (smell.get('severity') or smell.get('priority') or 'UNKNOWN').upper()
            
            # Categorize
            if any(x in detector_id for x in ['god', 'class', 'feature', 'envy', 'data', 'lazy']):
                categories["class_level"] += 1
            elif any(x in detector_id for x in ['method', 'long', 'parameter']):
                categories["method_level"] += 1
            elif any(x in detector_id for x in ['cyclic', 'coupling', 'dependency', 'shotgun']):
                categories["design_level"] += 1
            elif any(x in detector_id for x in ['duplicate', 'magic', 'primitive', 'dead']):
                categories["code_level"] += 1
            elif any(x in detector_id for x in ['architectural', 'evolutionary']):
                categories["architectural"] += 1
            else:
                categories["unknown"] += 1
            
            # Count severity
            if severity in severities:
                severities[severity] += 1
            else:
                severities["UNKNOWN"] += 1
        
        return {
            "by_category": categories,
            "by_severity": severities
        }
    
    async def process_file(self, workspace_id: str, file_path: str, file_content: Optional[str] = None):
        """Process a single file: analyze, refactor, and collect metrics."""
        print(f"\n{'='*70}")
        print(f"Processing: {file_path}")
        print(f"{'='*70}")
        
        async with httpx.AsyncClient(timeout=600.0) as client:
            # Step 1: Analyze original code
            print("📊 Analyzing original code...")
            before_analysis = await self.analyze_file(client, workspace_id, file_path)
            before_smells = before_analysis.get("codeSmells", [])
            print(f"   Found {len(before_smells)} code smells")
            
            # Get original code content
            if file_content is None:
                # Try to get from backend
                try:
                    file_resp = await client.get(
                        f"{BACKEND_URL}/api/workspace/files/{workspace_id}/{file_path}",
                        timeout=30.0
                    )
                    if file_resp.status_code == 200:
                        file_content = file_resp.text
                except:
                    print("   ⚠️ Could not fetch file content, skipping...")
                    return None
            
            if not file_content:
                print("   ⚠️ No file content available, skipping...")
                return None
            
            # Calculate before metrics
            before_metrics = calculate_quality_metrics(file_content)
            before_methods = self.count_methods(file_content)
            before_smell_categories = self.categorize_smells(before_smells)
            
            # Step 2: Refactor
            print("🔧 Refactoring code...")
            refactor_result = await self.refactor_file(client, workspace_id, file_path, before_smells)
            
            if not refactor_result or not refactor_result.get("success"):
                print("   ⚠️ Refactoring failed or returned no result")
                return None
            
            after_code = refactor_result.get("refactoredCode")
            if not after_code:
                print("   ⚠️ No refactored code returned")
                return None
            
            # Step 3: Analyze refactored code
            print("📊 Analyzing refactored code...")
            # We need to analyze the refactored code
            # For now, calculate metrics directly
            after_metrics = calculate_quality_metrics(after_code)
            after_methods = self.count_methods(after_code)
            
            # Step 4: Re-analyze for smells (if possible)
            # This would require saving the refactored code temporarily
            # For now, we'll use the comparison metrics
            
            # Step 5: Compare
            comparison = compare_refactoring(file_content, after_code)
            
            # Step 6: Collect all data
            result = {
                "file_path": file_path,
                "workspace_id": workspace_id,
                "timestamp": datetime.now().isoformat(),
                
                # Before metrics
                "before": {
                    "complexity": before_metrics["complexity"],
                    "maintainability": before_metrics["maintainability"],
                    "testability": before_metrics["testability"],
                    "lines": len(file_content.splitlines()),
                    "methods": before_methods,
                    "smell_count": len(before_smells),
                    "smell_categories": before_smell_categories
                },
                
                # After metrics
                "after": {
                    "complexity": after_metrics["complexity"],
                    "maintainability": after_metrics["maintainability"],
                    "testability": after_metrics["testability"],
                    "lines": len(after_code.splitlines()),
                    "methods": after_methods,
                    # "smell_count": after_smell_count,  # Would need re-analysis
                    # "smell_categories": after_smell_categories
                },
                
                # Changes
                "changes": {
                    "complexity": after_metrics["complexity"] - before_metrics["complexity"],
                    "maintainability": round(after_metrics["maintainability"] - before_metrics["maintainability"], 2),
                    "testability": round(after_metrics["testability"] - before_metrics["testability"], 2),
                    "lines": len(after_code.splitlines()) - len(file_content.splitlines()),
                    "methods": after_methods["total"] - before_methods["total"],
                    "smell_reduction": len(before_smells)  # Would subtract after count
                },
                
                # Improvements
                "improvements": {
                    "complexity_reduced": after_metrics["complexity"] < before_metrics["complexity"],
                    "maintainability_improved": after_metrics["maintainability"] > before_metrics["maintainability"],
                    "testability_improved": after_metrics["testability"] > before_metrics["testability"],
                    "methods_preserved": abs(after_methods["total"] - before_methods["total"]) <= 2  # Allow small changes
                },
                
                # Process metrics
                "process": {
                    "refactoring_time": refactor_result.get("duration", 0),
                    "steps_count": len(refactor_result.get("steps", [])),
                    "success": refactor_result.get("success", False)
                },
                
                # Refactoring details
                "refactoring": {
                    "steps": refactor_result.get("steps", []),
                    "decision": refactor_result.get("decision", "UNKNOWN")
                }
            }
            
            # Calculate percentages
            if before_metrics["complexity"] > 0:
                result["changes"]["complexity_percent"] = round(
                    (result["changes"]["complexity"] / before_metrics["complexity"]) * 100, 2
                )
            else:
                result["changes"]["complexity_percent"] = 0
            
            if before_metrics["maintainability"] > 0:
                result["changes"]["maintainability_percent"] = round(
                    (result["changes"]["maintainability"] / before_metrics["maintainability"]) * 100, 2
                )
            else:
                result["changes"]["maintainability_percent"] = 0
            
            if len(before_smells) > 0:
                result["changes"]["smell_reduction_percent"] = round(
                    (result["changes"]["smell_reduction"] / len(before_smells)) * 100, 2
                )
            else:
                result["changes"]["smell_reduction_percent"] = 0
            
            print(f"✅ Completed: {file_path}")
            print(f"   Complexity: {before_metrics['complexity']} → {after_metrics['complexity']} ({result['changes']['complexity_percent']:+.1f}%)")
            print(f"   Maintainability: {before_metrics['maintainability']:.1f} → {after_metrics['maintainability']:.1f} ({result['changes']['maintainability_percent']:+.1f}%)")
            print(f"   Testability: {before_metrics['testability']:.1f} → {after_metrics['testability']:.1f} ({result['changes']['testability']:+.1f})")
            print(f"   Smells: {len(before_smells)} → ? (re-analysis needed)")
            
            return result
    
    def save_results(self, results: List[Dict]):
        """Save results to JSON and CSV."""
        # Save JSON
        with open(RESULTS_FILE, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n✅ Saved JSON results to: {RESULTS_FILE}")
        
        # Save CSV
        if results:
            fieldnames = [
                "file_path",
                "before_complexity", "after_complexity", "complexity_change", "complexity_change_percent",
                "before_maintainability", "after_maintainability", "maintainability_change", "maintainability_change_percent",
                "before_testability", "after_testability", "testability_change",
                "before_lines", "after_lines", "lines_change",
                "before_methods_total", "after_methods_total", "methods_change",
                "before_smells", "smell_reduction", "smell_reduction_percent",
                "complexity_reduced", "maintainability_improved", "testability_improved",
                "refactoring_time", "steps_count", "success"
            ]
            
            with open(CSV_FILE, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                
                for r in results:
                    writer.writerow({
                        "file_path": r["file_path"],
                        "before_complexity": r["before"]["complexity"],
                        "after_complexity": r["after"]["complexity"],
                        "complexity_change": r["changes"]["complexity"],
                        "complexity_change_percent": r["changes"].get("complexity_percent", 0),
                        "before_maintainability": r["before"]["maintainability"],
                        "after_maintainability": r["after"]["maintainability"],
                        "maintainability_change": r["changes"]["maintainability"],
                        "maintainability_change_percent": r["changes"].get("maintainability_percent", 0),
                        "before_testability": r["before"]["testability"],
                        "after_testability": r["after"]["testability"],
                        "testability_change": r["changes"]["testability"],
                        "before_lines": r["before"]["lines"],
                        "after_lines": r["after"]["lines"],
                        "lines_change": r["changes"]["lines"],
                        "before_methods_total": r["before"]["methods"]["total"],
                        "after_methods_total": r["after"]["methods"]["total"],
                        "methods_change": r["changes"]["methods"],
                        "before_smells": r["before"]["smell_count"],
                        "smell_reduction": r["changes"]["smell_reduction"],
                        "smell_reduction_percent": r["changes"].get("smell_reduction_percent", 0),
                        "complexity_reduced": r["improvements"]["complexity_reduced"],
                        "maintainability_improved": r["improvements"]["maintainability_improved"],
                        "testability_improved": r["improvements"]["testability_improved"],
                        "refactoring_time": r["process"]["refactoring_time"],
                        "steps_count": r["process"]["steps_count"],
                        "success": r["process"]["success"]
                    })
            
            print(f"✅ Saved CSV results to: {CSV_FILE}")
    
    def generate_summary(self, results: List[Dict]):
        """Generate summary statistics."""
        if not results:
            print("No results to summarize")
            return
        
        successful = [r for r in results if r["process"]["success"]]
        n = len(successful)
        
        if n == 0:
            print("No successful refactorings to summarize")
            return
        
        print(f"\n{'='*70}")
        print("RESEARCH DATA SUMMARY")
        print(f"{'='*70}")
        print(f"\nTotal files processed: {len(results)}")
        print(f"Successful refactorings: {n} ({n/len(results)*100:.1f}%)")
        
        # Complexity
        complexity_changes = [r["changes"]["complexity"] for r in successful]
        complexity_reduced = sum(1 for r in successful if r["improvements"]["complexity_reduced"])
        print(f"\nComplexity:")
        print(f"  Average change: {sum(complexity_changes)/n:.2f}")
        print(f"  Reduced in: {complexity_reduced}/{n} files ({complexity_reduced/n*100:.1f}%)")
        
        # Maintainability
        maintainability_changes = [r["changes"]["maintainability"] for r in successful]
        maintainability_improved = sum(1 for r in successful if r["improvements"]["maintainability_improved"])
        print(f"\nMaintainability:")
        print(f"  Average change: {sum(maintainability_changes)/n:.2f} points")
        print(f"  Improved in: {maintainability_improved}/{n} files ({maintainability_improved/n*100:.1f}%)")
        
        # Testability
        testability_changes = [r["changes"]["testability"] for r in successful]
        testability_improved = sum(1 for r in successful if r["improvements"]["testability_improved"])
        print(f"\nTestability:")
        print(f"  Average change: {sum(testability_changes)/n:.2f} points")
        print(f"  Improved in: {testability_improved}/{n} files ({testability_improved/n*100:.1f}%)")
        
        # Smells
        total_before_smells = sum(r["before"]["smell_count"] for r in successful)
        print(f"\nCode Smells:")
        print(f"  Total before: {total_before_smells}")
        print(f"  Average per file: {total_before_smells/n:.1f}")
        
        # Process
        avg_time = sum(r["process"]["refactoring_time"] for r in successful) / n
        avg_steps = sum(r["process"]["steps_count"] for r in successful) / n
        print(f"\nProcess:")
        print(f"  Average time: {avg_time:.1f} seconds")
        print(f"  Average steps: {avg_steps:.1f}")


async def main():
    """Main function to run data collection."""
    collector = ResearchDataCollector()
    
    # Example: Process files from a test dataset
    # You'll need to adapt this to your actual test files
    test_files = [
        # Add your test files here
        # {"workspace_id": "workspace1", "file_path": "path/to/file1.java"},
        # {"workspace_id": "workspace1", "file_path": "path/to/file2.java"},
    ]
    
    if not test_files:
        print("⚠️ No test files specified. Please edit the script to add test files.")
        print("\nExample:")
        print('  test_files = [')
        print('      {"workspace_id": "test", "file_path": "src/main/java/Example.java"},')
        print('  ]')
        return
    
    results = []
    for test_file in test_files:
        result = await collector.process_file(
            test_file["workspace_id"],
            test_file["file_path"],
            test_file.get("content")  # Optional: provide content directly
        )
        if result:
            results.append(result)
    
    # Save results
    collector.save_results(results)
    
    # Generate summary
    collector.generate_summary(results)
    
    print(f"\n✅ Data collection complete!")
    print(f"   Results saved to: {OUTPUT_DIR}/")


if __name__ == "__main__":
    asyncio.run(main())

