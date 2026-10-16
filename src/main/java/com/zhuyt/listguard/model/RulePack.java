package com.zhuyt.listguard.model;

import java.util.List;

/** 版本化规则包：按平台+站点组织的一组合规规则。 */
public record RulePack(
        String name,
        String platform,
        String market,
        String version,
        String updated,
        List<Rule> rules) {
}
