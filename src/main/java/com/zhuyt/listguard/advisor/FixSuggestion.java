package com.zhuyt.listguard.advisor;

/** 一条改写建议：是否可自动改写、建议文本、说明。 */
public record FixSuggestion(boolean applicable, String suggestedText, String rationale) {

    public static FixSuggestion notApplicable(String rationale) {
        return new FixSuggestion(false, null, rationale);
    }
}
