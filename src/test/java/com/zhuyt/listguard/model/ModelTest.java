package com.zhuyt.listguard.model;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ModelTest {

    @Test
    void severity_max_returnsMoreSevere() {
        assertEquals(Severity.RED, Severity.max(Severity.YELLOW, Severity.RED));
        assertEquals(Severity.YELLOW, Severity.max(Severity.YELLOW, Severity.GREEN));
        assertEquals(Severity.GREEN, Severity.max(Severity.GREEN, Severity.GREEN));
    }

    @Test
    void listing_minimal() {
        var l = new Listing("SKU-1", "Title", List.of("b1"), "desc", List.of("k1"), "amazon", null);
        assertEquals("SKU-1", l.id());
        assertNull(l.aiDisclosure());
        assertEquals("amazon", l.platform());
    }

    @Test
    void finding_carriesAllContext() {
        var f = new Finding("promo-free-shipping", "promo_word", Severity.RED,
                "title", "free shipping", "促销词", "删除促销表述");
        assertEquals("promo-free-shipping", f.ruleId());
        assertEquals(Severity.RED, f.severity());
        assertEquals("title", f.field());
    }

    @Test
    void rulePack_basic() {
        var rule = new Rule("r1", "banned_word", Severity.RED, List.of("free shipping"), "促销词", "删除");
        var p = new RulePack("amazon-us", "amazon", "US", "0.1.0", "2026-10-16", List.of(rule));
        assertEquals(1, p.rules().size());
        assertEquals("0.1.0", p.version());
    }
}
