package com.zhuyt.listguard.model;

/** 一次命中：哪条规则、在哪个字段、命中了什么、为什么有风险、怎么改。 */
public record Finding(
        String ruleId,
        String category,
        Severity severity,
        String field,
        String matchedText,
        String message,
        String suggestion) {
}
