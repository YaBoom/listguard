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
    void suggest_removesCjkHitInsideLongerChineseRun() {
        // 中文无词边界：「全场全网最低价」中嵌入「全网最低价」，也必须能定位移除
        var finding = new Finding("promo-lowest-price", "promo_word", Severity.RED,
                "title", "全网最低价", "促销词", "删除促销表述");
        var s = suggester.suggest("全场全网最低价 手慢无", finding);
        assertTrue(s.applicable());
        assertTrue(s.suggestedText().contains("全场"));
        assertFalse(s.suggestedText().contains("全网最低价"));
    }

    @Test
    void suggest_preservesFullWidthPunctuationViaSpanRebuild() {
        // 全角标点只用于定位，不得污染建议文本：建议必须保留原文的「，」
        var finding = new Finding("promo-lowest-price", "promo_word", Severity.RED,
                "title", "全网最低价", "促销词", "删除促销表述");
        var s = suggester.suggest("全网最低价，手慢无", finding);
        assertTrue(s.applicable());
        assertTrue(s.suggestedText().contains("，"));
        assertFalse(s.suggestedText().contains(","));
        assertTrue(s.suggestedText().contains("手慢无"));
    }

    @Test
    void suggest_notApplicableWhenWholeTextIsTheHit() {
        // 整句即命中：移除后无剩余内容，应返回不可应用而非空建议
        var finding = new Finding("promo-best-seller", "promo_word", Severity.RED,
                "title", "best seller", "促销词", "删除");
        var s = suggester.suggest("Best Seller", finding);
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
