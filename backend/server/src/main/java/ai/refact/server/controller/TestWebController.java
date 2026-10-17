package ai.refact.server.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
public class TestWebController {
    
    @GetMapping("/test-web")
    @ResponseBody
    public String testWeb() {
        return "Test web controller is working!";
    }
}
