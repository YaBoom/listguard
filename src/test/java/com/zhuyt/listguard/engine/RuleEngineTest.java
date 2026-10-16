package com.zhuyt.listguard.engine;

import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.Listing;
import com.zhuyt.listguard.rules.RulePackLoader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RuleEngineTest {

    private RuleEngine engine;

    @BeforeEach
    void setUp() {
        engine = new RuleEngine(RulePackLoader.loadBuiltin("amazon-us"));
    }

    @Test
    void exactMatch_promoWord() {
        var l = new Listing("1", "Best Seller phone case", List.of(), "", List.of(), "amazon", "human");
        var fs = engine.scan(l);
        assertTrue(fs.stream().anyMatch(f -> f.matchedText().equalsIgnoreCase("best seller")));
        assertTrue(fs.stream().anyMatch(f -> f.ruleId().equals("promo-best-seller")));
    }

    @Test
    void obfuscatedMatch_freeSeparated() {
        var l = new Listing("1", "Ｆ-R-E-E shipping offer", List.of(), "", List.of(), "amazon", "human");
        var fs = engine.scan(l);
        assertTrue(fs.stream().anyMatch(f -> f.ruleId().equals("promo-free-shipping")));
    }

    @Test
    void scansAllFields_withFieldName() {
        var l = new Listing("1", "clean title", List.of("money-back guarantee"), "", List.of(), "amazon", "human");
        var fs = engine.scan(l);
        assertTrue(fs.stream().anyMatch(f -> f.field().equals("bullets[0]")));
    }

    @Test
    void regexMatch_guaranteedResults() {
        var l = new Listing("1", "t", List.of(), "Guaranteed results in 3 days", List.of(), "amazon", "human");
        var fs = engine.scan(l);
        assertTrue(fs.stream().anyMatch(f -> f.ruleId().equals("absolute-guaranteed-results")));
    }

    @Test
    void cleanListing_noFindings() {
        var l = new Listing("1", "Wireless earbuds with charging case",
                List.of("Bluetooth 5.3 support"), "Long battery life", List.of(), "amazon", "human");
        assertTrue(engine.scan(l).isEmpty());
    }

    @Test
    void dedup_sameRuleSameFieldSameText() {
        var l = new Listing("1", "best seller best seller", List.of(), "", List.of(), "amazon", "human");
        var fs = engine.scan(l);
        long count = fs.stream().filter(f -> f.ruleId().equals("promo-best-seller")).count();
        assertEquals(1, count);
    }

    @Test
    void aiDisclosureCategory_skippedByEngine() {
        // engine 不消费 ai_disclosure 规则（专用检查器负责）
        var l = new Listing("1", "clean", List.of(), "", List.of(), "amazon", null);
        assertFalse(engine.scan(l).stream().anyMatch(f -> f.category().equals("ai_disclosure")));
    }
}
