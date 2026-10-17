package ai.refact.engine.model;

import lombok.Builder;
import lombok.Data;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * Model representing a comprehensive remediation plan for security vulnerabilities.
 * 
 * Provides:
 * - Prioritized remediation steps
 * - Effort estimation
 * - Resource planning
 * - Timeline recommendations
 */
@Data
@Builder
public class RemediationPlan {
    
    private String planId;
    private Date createdDate;
    private Integer totalEffortHours;
    private List<RemediationTask> tasks;
    private Map<String, Integer> effortByPriority; // Priority -> estimated hours
    private Map<String, Integer> effortByCategory; // Category -> estimated hours
    private String recommendedTimeline; // e.g., "2 weeks", "1 month"
    
    /**
     * Individual remediation task.
     */
    @Data
    @Builder
    public static class RemediationTask {
        private String taskId;
        private String title;
        private String description;
        private String priority; // CRITICAL, HIGH, MEDIUM, LOW
        private VulnerabilityCategory category;
        private List<String> vulnerabilityIds; // Related vulnerability IDs
        private List<String> steps;
        private Integer estimatedHours;
        private String assignedTo;
        private String status; // PENDING, IN_PROGRESS, COMPLETED, DEFERRED
        private Date dueDate;
        private List<String> dependencies; // Task IDs that must be completed first
        private Map<String, String> resources; // Links to documentation, tools, etc.
    }
    
    /**
     * Get critical priority tasks.
     */
    public List<RemediationTask> getCriticalTasks() {
        return tasks != null ? tasks.stream()
            .filter(task -> "CRITICAL".equals(task.getPriority()))
            .toList() : List.of();
    }
    
    /**
     * Get high priority tasks.
     */
    public List<RemediationTask> getHighPriorityTasks() {
        return tasks != null ? tasks.stream()
            .filter(task -> "HIGH".equals(task.getPriority()))
            .toList() : List.of();
    }
    
    /**
     * Get tasks by status.
     */
    public List<RemediationTask> getTasksByStatus(String status) {
        return tasks != null ? tasks.stream()
            .filter(task -> status.equals(task.getStatus()))
            .toList() : List.of();
    }
    
    /**
     * Get pending tasks count.
     */
    public long getPendingTasksCount() {
        return tasks != null ? tasks.stream()
            .filter(task -> "PENDING".equals(task.getStatus()))
            .count() : 0;
    }
    
    /**
     * Get completed tasks count.
     */
    public long getCompletedTasksCount() {
        return tasks != null ? tasks.stream()
            .filter(task -> "COMPLETED".equals(task.getStatus()))
            .count() : 0;
    }
    
    /**
     * Calculate completion percentage.
     */
    public double getCompletionPercentage() {
        if (tasks == null || tasks.isEmpty()) {
            return 0.0;
        }
        
        long completed = getCompletedTasksCount();
        return (completed * 100.0) / tasks.size();
    }
    
    /**
     * Get estimated effort for critical and high priority tasks.
     */
    public int getImmediateEffortHours() {
        if (effortByPriority == null) {
            return 0;
        }
        
        int critical = effortByPriority.getOrDefault("CRITICAL", 0);
        int high = effortByPriority.getOrDefault("HIGH", 0);
        return critical + high;
    }
    
    /**
     * Get tasks that can be started immediately (no pending dependencies).
     */
    public List<RemediationTask> getReadyTasks() {
        return tasks != null ? tasks.stream()
            .filter(task -> "PENDING".equals(task.getStatus()))
            .filter(task -> {
                if (task.getDependencies() == null || task.getDependencies().isEmpty()) {
                    return true;
                }
                // Check if all dependencies are completed
                return task.getDependencies().stream()
                    .allMatch(depId -> tasks.stream()
                        .anyMatch(t -> depId.equals(t.getTaskId()) && "COMPLETED".equals(t.getStatus()))
                    );
            })
            .toList() : List.of();
    }
    
    /**
     * Get next recommended task based on priority and dependencies.
     */
    public RemediationTask getNextRecommendedTask() {
        List<RemediationTask> ready = getReadyTasks();
        if (ready.isEmpty()) {
            return null;
        }
        
        // Sort by priority: CRITICAL > HIGH > MEDIUM > LOW
        return ready.stream()
            .min((t1, t2) -> {
                int p1 = getPriorityValue(t1.getPriority());
                int p2 = getPriorityValue(t2.getPriority());
                return Integer.compare(p1, p2);
            })
            .orElse(null);
    }
    
    private int getPriorityValue(String priority) {
        return switch (priority) {
            case "CRITICAL" -> 0;
            case "HIGH" -> 1;
            case "MEDIUM" -> 2;
            case "LOW" -> 3;
            default -> 4;
        };
    }
    
    /**
     * Get plan summary.
     */
    public Map<String, Object> getSummary() {
        return Map.of(
            "totalTasks", tasks != null ? tasks.size() : 0,
            "pendingTasks", getPendingTasksCount(),
            "completedTasks", getCompletedTasksCount(),
            "completionPercentage", getCompletionPercentage(),
            "totalEffortHours", totalEffortHours != null ? totalEffortHours : 0,
            "immediateEffortHours", getImmediateEffortHours(),
            "recommendedTimeline", recommendedTimeline != null ? recommendedTimeline : "Not specified"
        );
    }
}

