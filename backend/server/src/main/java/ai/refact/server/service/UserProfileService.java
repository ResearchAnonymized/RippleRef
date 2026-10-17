package ai.refact.server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

/**
 * Lightweight user profile management.
 * Profiles are stored in ~/.refactai/users.json — no passwords, just identity.
 */
@Service
public class UserProfileService {
    private static final Logger logger = LoggerFactory.getLogger(UserProfileService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path usersFile;

    public static class UserProfile {
        public String id;
        public String name;
        public String role;       // e.g. "researcher", "developer", "evaluator"
        public String email;      // optional
        public long createdAt;
        public long lastActiveAt;
        public int projectsCount;
        public int refactoringsCount;
    }

    public UserProfileService() {
        this.usersFile = Paths.get(System.getProperty("user.home"), ".refactai", "users.json");
        ensureFile();
        logger.info("UserProfileService initialized — {} profile(s) on disk", readAll().size());
    }

    private void ensureFile() {
        try {
            Path dir = usersFile.getParent();
            if (!Files.exists(dir)) Files.createDirectories(dir);
            if (!Files.exists(usersFile)) Files.write(usersFile, "[]".getBytes());
        } catch (IOException e) {
            logger.error("Failed to initialize users file", e);
        }
    }

    public synchronized List<UserProfile> readAll() {
        try {
            byte[] bytes = Files.readAllBytes(usersFile);
            return JSON.readValue(bytes, JSON.getTypeFactory().constructCollectionType(List.class, UserProfile.class));
        } catch (Exception e) {
            logger.warn("Failed to read users file: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    private synchronized void writeAll(List<UserProfile> profiles) {
        try {
            JSON.writerWithDefaultPrettyPrinter().writeValue(usersFile.toFile(), profiles);
        } catch (Exception e) {
            logger.error("Failed to write users file", e);
        }
    }

    public UserProfile createProfile(String name, String role, String email) {
        List<UserProfile> profiles = readAll();
        String trimmed = name != null ? name.trim() : "";
        if (!trimmed.isEmpty()) {
            for (UserProfile existing : profiles) {
                if (existing.name != null && existing.name.equalsIgnoreCase(trimmed)) {
                    existing.lastActiveAt = System.currentTimeMillis();
                    if (role != null && !role.isBlank()) {
                        existing.role = role;
                    }
                    if (email != null && !email.isBlank()) {
                        existing.email = email;
                    }
                    writeAll(profiles);
                    logger.info("Reused existing user profile: {} ({})", existing.name, existing.id);
                    return existing;
                }
            }
        }
        UserProfile p = new UserProfile();
        p.id = "user-" + UUID.randomUUID().toString().substring(0, 8);
        p.name = name;
        p.role = role != null ? role : "developer";
        p.email = email;
        p.createdAt = System.currentTimeMillis();
        p.lastActiveAt = p.createdAt;
        p.projectsCount = 0;
        p.refactoringsCount = 0;
        profiles.add(p);
        writeAll(profiles);
        logger.info("Created user profile: {} ({})", p.name, p.id);
        return p;
    }

    public Optional<UserProfile> getProfile(String userId) {
        return readAll().stream().filter(p -> p.id.equals(userId)).findFirst();
    }

    public UserProfile updateProfile(String userId, String name, String role, String email) {
        List<UserProfile> profiles = readAll();
        for (UserProfile p : profiles) {
            if (p.id.equals(userId)) {
                if (name != null) p.name = name;
                if (role != null) p.role = role;
                if (email != null) p.email = email;
                p.lastActiveAt = System.currentTimeMillis();
                writeAll(profiles);
                return p;
            }
        }
        throw new IllegalArgumentException("User not found: " + userId);
    }

    public void touchActivity(String userId) {
        List<UserProfile> profiles = readAll();
        for (UserProfile p : profiles) {
            if (p.id.equals(userId)) {
                p.lastActiveAt = System.currentTimeMillis();
                writeAll(profiles);
                return;
            }
        }
    }

    public void incrementRefactorings(String userId) {
        List<UserProfile> profiles = readAll();
        for (UserProfile p : profiles) {
            if (p.id.equals(userId)) {
                p.refactoringsCount++;
                p.lastActiveAt = System.currentTimeMillis();
                writeAll(profiles);
                return;
            }
        }
    }

    public void incrementProjects(String userId) {
        List<UserProfile> profiles = readAll();
        for (UserProfile p : profiles) {
            if (p.id.equals(userId)) {
                p.projectsCount++;
                p.lastActiveAt = System.currentTimeMillis();
                writeAll(profiles);
                return;
            }
        }
    }

    public void deleteProfile(String userId) {
        List<UserProfile> profiles = readAll();
        profiles.removeIf(p -> p.id.equals(userId));
        writeAll(profiles);
        logger.info("Deleted user profile: {}", userId);
    }
}
