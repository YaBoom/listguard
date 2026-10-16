package com.zhuyt.listguard.report;

import com.zhuyt.listguard.engine.AuditResult;
import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.RulePack;
import com.zhuyt.listguard.model.Severity;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReporterGoldenTest {

    private AuditResult sample() {
        var pack = new RulePack("amazon-us", "amazon", "US", "2026.10", "2026-10-16", List.of());
        var findings = List.of(
                new Finding("promo-free-shipping", "promo_word", Severity.RED,
                        "title", "free shipping", "促销词违反平台政策", "删除促销表述"),
                new Finding("ai-disclosure-missing", "ai_disclosure", Severity.YELLOW,
                        "aiDisclosure", "未声明", "缺少 AI 内容披露", "后台补披露字段"));
        return new AuditResult("SKU-001", findings, Severity.RED, pack);
    }

    private String golden(String name) throws Exception {
        return Files.readString(Path.of("src/test/resources/golden/" + name))
                .replace("\r\n", "\n").stripTrailing();
    }

    /** Jackson pretty printer 使用平台行分隔符，比较前归一为 LF。 */
    private String lf(String s) {
        return s.replace("\r\n", "\n").stripTrailing();
    }

    @Test
    void json_matchesGoldenFile() throws Exception {
        assertEquals(golden("report.json"), lf(new JsonReporter().render(sample())));
    }

    @Test
    void sarif_matchesGoldenFile() throws Exception {
        assertEquals(golden("report.sarif"), lf(new SarifReporter().render(sample())));
    }

    @Test
    void text_containsKeyLines() {
        String out = new TextReporter().render(sample());
        assertTrue(out.contains("listing: SKU-001"));
        assertTrue(out.contains("rule-pack: amazon-us@2026.10"));
        assertTrue(out.contains("overall: RED"));
        assertTrue(out.contains("[RED] title promo-free-shipping hit=\"free shipping\""));
        assertTrue(out.contains("[YELLOW] aiDisclosure ai-disclosure-missing hit=\"未声明\""));
        assertTrue(out.contains("counts: RED:1 YELLOW:1 GREEN:0"));
    }

    @Test
    void text_cleanListing_printsCleanLine() {
        var pack = new RulePack("amazon-us", "amazon", "US", "2026.10", "2026-10-16", List.of());
        var result = new AuditResult("SKU-OK", List.of(), Severity.GREEN, pack);
        String out = new TextReporter().render(result);
        assertTrue(out.contains("overall: GREEN"));
        assertTrue(out.contains("counts: RED:0 YELLOW:0 GREEN:0"));
    }
}
