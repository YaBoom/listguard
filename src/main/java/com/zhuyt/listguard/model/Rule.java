package com.zhuyt.listguard.model;

import java.util.List;

/**
 * 一条合规规则。category 取值：
 * banned_word / promo_word / absolute_claim / certification_claim / trademark_risk / ai_disclosure。
 * pattern 以 re: 前缀表示正则，否则为普通关键词（引擎做归一化匹配）。
 */
public record Rule(
        String id,
        String category,
        Severity severity,
        List<String> patterns,
        String message,
        String suggestion) {
}
