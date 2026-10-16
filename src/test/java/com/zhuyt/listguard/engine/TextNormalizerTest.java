package com.zhuyt.listguard.engine;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TextNormalizerTest {

    @Test
    void fold_caseAndFullwidthAndSpaces() {
        assertEquals("free shipping", TextNormalizer.fold("Ｆree  Shipping"));
    }

    @Test
    void fold_keepsCjk() {
        assertEquals("包邮促销", TextNormalizer.fold("包  邮 促 销"));
        assertEquals("包邮 sale 促销", TextNormalizer.fold("包 邮  SALE 促 销"));
    }

    @Test
    void condense_stripsSeparators() {
        assertEquals("freeshipping", TextNormalizer.condense("F - R - E - E   shipping"));
    }

    @Test
    void condense_keepsAlnum() {
        assertEquals("pro99", TextNormalizer.condense("Pro-99"));
    }

    @Test
    void condense_handlesNullAndEmpty() {
        assertEquals("", TextNormalizer.condense(null));
        assertEquals("", TextNormalizer.condense(""));
    }
}
