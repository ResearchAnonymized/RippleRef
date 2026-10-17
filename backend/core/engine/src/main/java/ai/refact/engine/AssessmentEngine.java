package ai.refact.engine;

import ai.refact.api.ReasonDetector;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.ProjectContext;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Main assessment engine that orchestrates the detection process.
 * Uses Spring's dependency injection to discover and run all available detectors.
 */
@Service
public class AssessmentEngine {
    
    private static final Logger logger = LoggerFactory.getLogger(AssessmentEngine.class);
    
    private final List<ReasonDetector> detectors;
    
    @Autowired
    public AssessmentEngine(List<ReasonDetector> detectors) {
        this.detectors = detectors;
        
        logger.info("AssessmentEngine initialized with {} detectors", detectors.size());
        detectors.forEach(detector -> 
                logger.debug("Registered detector: {} - {}", detector.id(), detector.category())
        );
    }
    
    /**
     * Performs a comprehensive assessment of the project.
     */
    public List<ReasonEvidence> assess(ProjectContext projectContext) {
        logger.info("Starting assessment for project at {}", projectContext.root());
        
        try {
            // Run all applicable detectors
            List<ReasonEvidence> allEvidences = detectors.stream()
                    .filter(detector -> detector.isApplicable(projectContext))
                    .flatMap(detector -> runDetector(detector, projectContext))
                    .collect(Collectors.toList());
            
            logger.info("Assessment completed: {} findings", allEvidences.size());
            return allEvidences;
            
        } catch (Exception e) {
            logger.error("Assessment failed", e);
            throw new RuntimeException("Assessment failed", e);
        }
    }
    
    private Stream<ReasonEvidence> runDetector(ReasonDetector detector, ProjectContext projectContext) {
        try {
            logger.debug("Running detector: {}", detector.id());
            Stream<ReasonEvidence> evidences = detector.detect(projectContext);
            logger.debug("Detector {} running", detector.id());
            return evidences;
        } catch (Exception e) {
            logger.error("Detector {} failed", detector.id(), e);
            return Stream.empty();
        }
    }
}
