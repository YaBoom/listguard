package com.zhuyt.listguard.engine;

import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.RulePack;
import com.zhuyt.listguard.model.Severity;

import java.util.List;

/** 一次审计的结果：单条 listing 的全部命中与整体分级。 */
public record AuditResult(
        String listingId,
        List<Finding> findings,
        Severity overall,
        RulePack rulePack) {
}
