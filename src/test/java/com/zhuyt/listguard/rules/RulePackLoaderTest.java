package com.zhuyt.listguard.rules;

import com.zhuyt.listguard.model.RulePack;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RulePackLoaderTest {

    @Test
    void loadBuiltin_amazonUs() {
        RulePack p = RulePackLoader.loadBuiltin("amazon-us");
        assertEquals("amazon", p.platform());
        assertTrue(p.rules().size() >= 15, "amazon-us 应至少 15 条规则");
        assertTrue(p.version() != null && !p.version().isBlank());
        assertTrue(p.rules().stream().anyMatch(r -> r.patterns().contains("free shipping")));
    }

    @Test
    void loadBuiltin_temuAndTiktok() {
        assertEquals("temu", RulePackLoader.loadBuiltin("temu-global").platform());
        assertEquals("tiktok", RulePackLoader.loadBuiltin("tiktok-us").platform());
    }

    @Test
    void unknownPack_failsFastWithHint() {
        var e = assertThrows(IllegalArgumentException.class, () -> RulePackLoader.loadBuiltin("nope"));
        assertTrue(e.getMessage().contains("nope"));
    }

    @Test
    void loadFromCustomDir(@TempDir Path dir) throws Exception {
        Files.writeString(dir.resolve("mini.yaml"),
                "name: mini\nplatform: x\nmarket: us\nversion: \"0.1\"\nupdated: \"2026-10-16\"\n"
                        + "rules:\n  - id: r1\n    category: promo_word\n    severity: RED\n"
                        + "    patterns: [free shipping]\n    message: 促销词\n    suggestion: 删除\n");
        var p = RulePackLoader.load(dir.resolve("mini.yaml"));
        assertEquals("mini", p.name());
        assertEquals(1, p.rules().size());
    }

    @Test
    void invalidPack_missingVersion_failsFast(@TempDir Path dir) throws Exception {
        Files.writeString(dir.resolve("bad.yaml"),
                "name: bad\nplatform: x\nmarket: us\nversion: \"\"\nrules: []\n");
        assertThrows(IllegalStateException.class, () -> RulePackLoader.load(dir.resolve("bad.yaml")));
    }
}
