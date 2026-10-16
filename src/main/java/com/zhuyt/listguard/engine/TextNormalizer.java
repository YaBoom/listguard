package com.zhuyt.listguard.engine;

import java.util.regex.Pattern;

/** 文本归一化：为匹配做折叠与混淆压缩，纯函数。 */
public final class TextNormalizer {

    private static final Pattern CJK_GAP = Pattern.compile("(?<=[\\u4e00-\\u9fff])\\s+(?=[\\u4e00-\\u9fff])");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private TextNormalizer() {
    }

    /**
     * 折叠：全角 ASCII 转半角、转小写、CJK 字符之间的空白移除、其余连续空白折叠为单个空格。
     * 规则与被匹配词共用，保证两侧一致。
     */
    public static String fold(String text) {
        if (text == null || text.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder(text.length());
        for (char raw : text.toCharArray()) {
            char c = toHalfWidth(raw);
            sb.append(Character.isWhitespace(c) ? ' ' : Character.toLowerCase(c));
        }
        String out = CJK_GAP.matcher(sb).replaceAll("");
        return WHITESPACE.matcher(out).replaceAll(" ").trim();
    }

    /** 压缩：fold 后删除所有非字母数字字符，用于对抗分隔符混淆（如 f-r-e-e）。 */
    public static String condense(String text) {
        String folded = fold(text);
        StringBuilder sb = new StringBuilder(folded.length());
        for (char c : folded.toCharArray()) {
            if (Character.isLetterOrDigit(c)) {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private static char toHalfWidth(char c) {
        if (c >= 0xFF01 && c <= 0xFF5E) {
            return (char) (c - 0xFEE0);
        }
        if (c == 0x3000) {
            return ' ';
        }
        return c;
    }
}
