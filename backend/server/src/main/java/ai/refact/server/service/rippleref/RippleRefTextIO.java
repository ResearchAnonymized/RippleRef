package ai.refact.server.service.rippleref;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

final class RippleRefTextIO {

    private RippleRefTextIO() {}

    static String readTextLenient(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (java.nio.charset.MalformedInputException | java.nio.charset.UnmappableCharacterException e) {
            try {
                byte[] bytes = Files.readAllBytes(file);
                return new String(bytes, StandardCharsets.ISO_8859_1);
            } catch (IOException ex) {
                return "";
            }
        } catch (IOException e) {
            return "";
        }
    }
}
