package ai.refact.server.controller;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * Simple test controller for security endpoints.
 */
@RestController
@RequestMapping("/security-test")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"}, allowCredentials = "true")
public class SecurityTestController {

    private static final Logger logger = LoggerFactory.getLogger(SecurityTestController.class);
    
    public SecurityTestController() {
        logger.info("SecurityTestController initialized!");
    }

    @GetMapping("/test")
    public ResponseEntity<Map<String, Object>> test() {
        logger.info("Security test endpoint called");
        Map<String, Object> result = new HashMap<>();
        result.put("message", "Security test endpoint working!");
        result.put("timestamp", new Date());
        return ResponseEntity.ok(result);
    }
}





