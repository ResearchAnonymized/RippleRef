package ai.refact.server.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MinimalTestController {

    @GetMapping("/api/minimal")
    public String minimal() {
        return "Minimal controller is working!";
    }
}
