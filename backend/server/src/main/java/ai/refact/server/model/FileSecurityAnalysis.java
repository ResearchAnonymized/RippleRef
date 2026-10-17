package ai.refact.server.model;

import ai.refact.engine.model.SecurityVulnerability;
import lombok.Builder;
import lombok.Data;

import java.util.Date;
import java.util.List;

/**
 * Security analysis result for a single file.
 */
@Data
@Builder
public class FileSecurityAnalysis {
    private String filePath;
    private List<SecurityVulnerability> vulnerabilities;
    private int totalVulnerabilities;
    private int criticalCount;
    private int highCount;
    private int mediumCount;
    private int lowCount;
    private boolean hasError;
    private String errorMessage;
    private Date analyzedAt;
}
