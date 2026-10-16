package com.zhuyt.listguard.model;

import java.util.List;

/**
 * 一条商品 listing 的文本输入。aiDisclosure 取值：
 * human / assisted / ai_generated / null(未声明)。
 */
public record Listing(
        String id,
        String title,
        List<String> bullets,
        String description,
        List<String> keywords,
        String platform,
        String aiDisclosure) {

    public Listing {
        bullets = bullets == null ? List.of() : List.copyOf(bullets);
        keywords = keywords == null ? List.of() : List.copyOf(keywords);
    }
}
