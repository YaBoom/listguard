package com.zhuyt.listguard.model;

/** 风险等级：RED(红线，须阻断) &lt; YELLOW(警告) &lt; GREEN(通过，仅作整体分级语义)。 */
public enum Severity {
    RED, YELLOW, GREEN;

    /** 返回更严重的一方（ordinal 较小者）。 */
    public static Severity max(Severity a, Severity b) {
        return a.ordinal() <= b.ordinal() ? a : b;
    }
}
