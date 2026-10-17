package ai.refact.api;

import java.nio.file.Path;
import java.util.List;

public interface RefactoringEngine {
    RefactoringResult refactor(RefactoringContext context);
    RefactoringResult extractMethod(RefactoringContext context);
    RefactoringResult extractClass(RefactoringContext context);
    RefactoringResult renameSymbol(RefactoringContext context, String oldName, String newName);
    RefactoringResult removeDuplication(RefactoringContext context, List<DuplicationLocation> duplications);
    RefactoringResult improveSecurity(RefactoringContext context, List<SecurityIssue> issues);
    RefactoringResult optimizePerformance(RefactoringContext context, List<PerformanceIssue> issues);
    RefactoringResult updateDocumentation(RefactoringContext context, DocumentationUpdateRequest request);
    RefactoringResult applyRefactoring(RefactoringContext context, RefactoringOperation operation);
    RefactoringResult validateSafety(RefactoringContext context, RefactoringOperation operation);
    RollbackResult rollback(RefactoringContext context);
    List<RefactoringRecommendation> getRecommendations(RefactoringContext context);
}
