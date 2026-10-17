package ai.refact.server.controller;

import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@Component
@RestController
public class SimpleController {
    
    @GetMapping("/api/simple")
    public String simple() {
        return "Simple controller is working!";
    }
}
