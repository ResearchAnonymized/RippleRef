package ai.refact.api;

import java.util.List;

public record DocumentationUpdateRequest(
    List<Integer> linesToUpdate,
    String newDocumentation,
    boolean updateInlineComments,
    boolean updateJavaDoc,
    boolean updateReadme
) {}
