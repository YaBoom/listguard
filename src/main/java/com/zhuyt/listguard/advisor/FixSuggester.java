package com.zhuyt.listguard.advisor;

import com.zhuyt.listguard.engine.TextNormalizer;
import com.zhuyt.listguard.model.Finding;

import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 规则化修复建议：对可定位的命中片段给出移除改写。
 * 以「压缩后的命中字符序列 + 任意非字母数字分隔符」构造正则，
 * 同时兼容混淆变体（f-r-e-e shipping）与全角变体；
 * ai_disclosure 类与原文未命中的建议不自动改写。
 */
public class FixSuggester {

    /** 可自动移除改写的类别。 */
    private static final Set<String> REMOVABLE_CATEGORIES = Set.of(
            "banned_word", "promo_word", "absolute_claim",
            "certification_claim", "trademark_risk");

    /** 分隔符：字母数字与 CJK 之外的任意字符（含空格/连字符/全角符号残留）。 */
    private static final String SEP = "[^0-9A-Za-z\\u4e00-\\u9fff]*";
    private static final String BOUNDARY_LEFT_LATIN = "(?<![0-9A-Za-z])";
    private static final String BOUNDARY_RIGHT_LATIN = "(?![0-9A-Za-z])";
    private static final String BOUNDARY_LEFT_STRICT = "(?<![0-9A-Za-z\\u4e00-\\u9fff])";
    private static final String BOUNDARY_RIGHT_STRICT = "(?![0-9A-Za-z\\u4e00-\\u9fff])";

    public FixSuggestion suggest(String originalText, Finding finding) {
        if (originalText == null || originalText.isBlank()
                || !REMOVABLE_CATEGORIES.contains(finding.category())) {
            return FixSuggestion.notApplicable("类别 [" + finding.category() + "] 不支持自动改写");
        }
        String condensedHit = TextNormalizer.condense(finding.matchedText());
        if (condensedHit.isEmpty()) {
            return FixSuggestion.notApplicable("命中片段为空");
        }

        Pattern pattern = buildRemovalPattern(condensedHit);
        String normalized = halfWidth(originalText);
        Matcher m = pattern.matcher(normalized);
        if (!m.find()) {
            return FixSuggestion.notApplicable("原文未包含可移除的命中片段");
        }
        // halfWidth 是逐字符 1:1 映射，normalized 上的 span 与原文字符位置一致：
        // 定位用归一化文本，拼接用原文，避免全角标点被静默转写。
        StringBuilder out = new StringBuilder();
        int pos = 0;
        m.reset();
        while (m.find()) {
            out.append(originalText, pos, m.start()).append(' ');
            pos = m.end();
        }
        out.append(originalText, pos, originalText.length());
        String suggested = out.toString().replaceAll("\\s{2,}", " ").trim();
        if (suggested.isEmpty()) {
            return FixSuggestion.notApplicable("移除后无剩余文案，建议整体重写");
        }
        return new FixSuggestion(true, suggested,
                "移除违规表述 [" + finding.matchedText() + "]，其余文案保留。" + finding.suggestion());
    }

    /** 构造：边界 + 逐字符 quote + 分隔符连接 的移除正则。
     *  命中含 CJK 时仅用拉丁词边界——中文词嵌入连续中文串属正常形态，
     *  若两侧也要求非 CJK 边界，「全场全网最低价」中的「全网最低价」永远无法定位。 */
    private static Pattern buildRemovalPattern(String condensedHit) {
        boolean hasCjk = condensedHit.codePoints().anyMatch(c -> c >= 0x4E00 && c <= 0x9FFF);
        String left = hasCjk ? BOUNDARY_LEFT_LATIN : BOUNDARY_LEFT_STRICT;
        String right = hasCjk ? BOUNDARY_RIGHT_LATIN : BOUNDARY_RIGHT_STRICT;
        StringBuilder sb = new StringBuilder(left);
        for (int i = 0; i < condensedHit.length(); i++) {
            if (i > 0) {
                sb.append(SEP);
            }
            sb.append(Pattern.quote(String.valueOf(condensedHit.charAt(i))));
        }
        sb.append(right);
        return Pattern.compile(sb.toString(), Pattern.CASE_INSENSITIVE);
    }

    /** 全角转半角，保证全角混淆变体也能按同一字符序列匹配。 */
    private static String halfWidth(String text) {
        StringBuilder sb = new StringBuilder(text.length());
        for (char c : text.toCharArray()) {
            if (c >= 0xFF01 && c <= 0xFF5E) {
                sb.append((char) (c - 0xFEE0));
            } else if (c == 0x3000) {
                sb.append(' ');
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
