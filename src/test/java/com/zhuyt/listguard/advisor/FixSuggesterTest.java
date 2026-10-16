package com.zhuyt.listguard.advisor;

import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.Severity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FixSuggesterTest {

    private final FixSuggester suggester = new FixSuggester();

    @Test
    void suggest_removalForPromoWord() {
        var finding = new Finding("promo-free-shipping", "promo_word", Severity.RED,
                "title", "free shipping", "促销词", "删除促销表述");
        var s = suggester.suggest("Free Shipping Wireless Earbuds", finding);
        assertTrue(s.applicable());
        assertTrue(s.suggestedText().contains("Wireless Earbuds"));
        assertFalse(s.suggestedText().toLowerCase().contains("free shipping"));
    }

    @Test
    void suggest_removesObfuscatedVariant() {
        var finding = new Finding("promo-free-shipping", "promo_word", Severity.RED,
                "title", "free shipping", "促销词", "删除促销表述");
        var s = suggester.suggest("Ｆ-R-E-E shipping wireless earbuds", finding);
        assertTrue(s.applicable());
        assertFalse(s.suggestedText().toLowerCase().replace("-", "").contains("free shipping"));
    }

    @Test
    void suggest_notApplicableForDisclosureCategory() {
        var finding = new Finding("ai-disclosure-missing", "ai_disclosure", Severity.YELLOW,
                "aiDisclosure", "未声明", "未声明披露", "去后台补披露字段");
        var s = suggester.suggest("any text", finding);
        assertFalse(s.applicable());
    }

    @Test
    void suggest_originalTextUntouchedWhenNoHit() {
        var finding = new Finding("promo-best-seller", "promo_word", Severity.RED,
                "title", "best seller", "促销词", "删除");
        var s = suggester.suggest("totally different text", finding);
        assertFalse(s.applicable());
    }
}
