package ai.refact.engine.security;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Result of applying a security fix.
 */
@Data
@Builder
public class FixResult {
    private String fixId;
    private boolean success;
    private String originalContent;
    private String fixedContent;
    private List<String> errors;
    private SecurityFixEngine.VerificationResult verification;
    private String message;
    
    /**
     * Create a successful fix result.
     */
    public static FixResult success(String fixId, String originalContent, String fixedContent, 
                                    SecurityFixEngine.VerificationResult verification) {
        return FixResult.builder()
            .fixId(fixId)
            .success(true)
            .originalContent(originalContent)
            .fixedContent(fixedContent)
            .verification(verification)
            .message("Fix applied successfully")
            .build();
    }
    
    /**
     * Create a failed fix result.
     */
    public static FixResult failure(String fixId, List<String> errors) {
        return FixResult.builder()
            .fixId(fixId)
            .success(false)
            .errors(errors)
            .message("Failed to apply fix")
            .build();
    }
}

