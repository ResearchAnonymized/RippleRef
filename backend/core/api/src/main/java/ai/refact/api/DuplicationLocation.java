package ai.refact.api;

public record DuplicationLocation(
    int startLine,
    int endLine,
    String duplicatedCode,
    double similarity
) {}
