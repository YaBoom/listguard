package com.zhuyt.listguard.engine;

import com.zhuyt.listguard.model.Listing;
import com.zhuyt.listguard.model.RulePack;
import com.zhuyt.listguard.model.Severity;
import com.zhuyt.listguard.rules.RulePackLoader;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuditServiceTest {

    private final AuditService service = new AuditService();

    @Test
    void aggregate_redListing_overallRed() {
        var l = new Listing("1", "Best Seller phone case free shipping", List.of(), "", List.of(), "amazon", null);
        var r = service.audit(l, RulePackLoader.loadBuiltin("amazon-us"));
        assertEquals(Severity.RED, r.overall());
        assertTrue(r.findings().size() >= 2);
        assertEquals("amazon-us", r.rulePack().name());
        assertEquals("1", r.listingId());
    }

    @Test
    void aggregate_yellowOnly_overallYellow() {
        var l = new Listing("1", "clean title", List.of(), "", List.of(), "amazon", null);
        var r = service.audit(l, RulePackLoader.loadBuiltin("amazon-us"));
        assertEquals(Severity.YELLOW, r.overall());
    }

    @Test
    void aggregate_cleanListing_greenOverall() {
        var l = new Listing("1", "Wireless earbuds with charging case",
                List.of("Bluetooth 5.3 support"), "Long battery life", List.of(), "amazon", "human");
        var r = service.audit(l, RulePackLoader.loadBuiltin("amazon-us"));
        assertEquals(Severity.GREEN, r.overall());
        assertTrue(r.findings().isEmpty());
    }

    @Test
    void auditBatch_multipleListings() {
        var l1 = new Listing("a", "Best Seller case", List.of(), "", List.of(), "amazon", "human");
        var l2 = new Listing("b", "clean case", List.of(), "", List.of(), "amazon", "human");
        List<AuditResult> results = service.auditAll(List.of(l1, l2), RulePackLoader.loadBuiltin("amazon-us"));
        assertEquals(2, results.size());
        assertEquals(Severity.RED, results.get(0).overall());
        assertEquals(Severity.GREEN, results.get(1).overall());
    }
}
