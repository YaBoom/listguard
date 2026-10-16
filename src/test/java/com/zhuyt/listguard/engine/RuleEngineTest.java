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
    void dedup_repeatedSameText_singleFinding() {
        var l = new Listing("1", "free shipping free shipping", List.of(), "", List.of(), "amazon", "human");
        var fs = engine.scan(l).stream().filter(f -> f.ruleId().equals("promo-free-shipping")).toList();
        assertEquals(1, fs.size());
    }

    @Test
    void dedup_variantPatterns_sameRuleTwoFindings() {
        // best seller 与 bestseller 是同规则的两个不同命中片段，各自保留（FixSuggester 依赖 matchedText）
        var l = new Listing("1", "best seller bestseller", List.of(), "", List.of(), "amazon", "human");
        var fs = engine.scan(l).stream().filter(f -> f.ruleId().equals("promo-best-seller")).toList();
        assertEquals(2, fs.size());
    }

    @Test
    void multiPattern_sameRuleBothMatched_yieldsTwoFindings() {
        var l = new Listing("1", "t", List.of(), "top rated number one product", List.of(), "amazon", "human");
        var fs = engine.scan(l).stream().filter(f -> f.ruleId().equals("absolute-no1")).toList();
        assertEquals(2, fs.size());
        assertTrue(fs.stream().anyMatch(f -> f.matchedText().equals("top rated")));
        assertTrue(fs.stream().anyMatch(f -> f.matchedText().equals("number one")));
    }

    @Test
    void wordBoundary_cureDoesNotMatchSecure() {
        var l = new Listing("1", "Secure payment checkout", List.of(), "", List.of(), "amazon", "human");
        assertTrue(engine.scan(l).stream().noneMatch(f -> f.ruleId().equals("absolute-cure")));
    }

    @Test
    void aiDisclosureCategory_skippedByEngine() {
        // engine 不消费 ai_disclosure 规则（专用检查器负责）
        var l = new Listing("1", "clean", List.of(), "", List.of(), "amazon", null);
        assertFalse(engine.scan(l).stream().anyMatch(f -> f.category().equals("ai_disclosure")));
    }
}
