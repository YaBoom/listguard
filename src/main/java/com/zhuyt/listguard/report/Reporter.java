package com.zhuyt.listguard.report;

import com.zhuyt.listguard.engine.AuditResult;

/** 报告器：把一次审计结果渲染为指定格式文本。 */
public interface Reporter {

    String render(AuditResult result);
}
