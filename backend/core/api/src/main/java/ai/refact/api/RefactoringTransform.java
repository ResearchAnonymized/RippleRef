package ai.refact.api;

/**
 * SPI for applying refactoring transformations to code.
 */
public interface RefactoringTransform {
    
    /**
     * Unique identifier for this transform.
     */
    String id();
    
    /**
     * Human-readable description of what this transform does.
     */
    String description();
    
    /**
     * Check if this transform is applicable to the given target.
     */
    boolean isApplicable(CodeModel model, TransformTarget target, PolicyContext policy);
    
    /**
     * Generate a preview of what this transform would do.
     */
    TransformPreview preview(CodeModel model, TransformTarget target);
    
    /**
     * Apply this transform to the given target.
     */
    TransformResult apply(CodeModel model, TransformTarget target);
}
