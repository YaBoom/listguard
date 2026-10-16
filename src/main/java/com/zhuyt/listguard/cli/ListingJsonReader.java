package com.zhuyt.listguard.cli;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhuyt.listguard.model.Listing;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** listing JSON 文件读取：字段缺失时安全缺省，id 缺省取文件名。 */
public final class ListingJsonReader {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ListingJsonReader() {
    }

    public static Listing read(Path file, String defaultPlatform) throws IOException {
        JsonNode n = MAPPER.readTree(file.toFile());
        if (!n.isObject()) {
            // fail-closed：非对象根（如数组）无法作为 listing 审计，交由上层按解析失败处理
            throw new IOException("listing 根节点必须是 JSON 对象，实际为 " + n.getNodeType());
        }
        String fileName = file.getFileName() == null ? "listing" : file.getFileName().toString();
        String defaultId = fileName.endsWith(".json") ? fileName.substring(0, fileName.length() - 5) : fileName;
        return new Listing(
                text(n, "id", defaultId),
                text(n, "title", ""),
                strings(n.get("bullets")),
                text(n, "description", ""),
                strings(n.get("keywords")),
                text(n, "platform", defaultPlatform),
                n.hasNonNull("aiDisclosure") ? n.get("aiDisclosure").asText() : null);
    }

    private static String text(JsonNode n, String field, String defaultValue) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? defaultValue : v.asText();
    }

    private static List<String> strings(JsonNode array) {
        List<String> result = new ArrayList<>();
        if (array != null && array.isArray()) {
            for (JsonNode item : array) {
                result.add(item.asText());
            }
        }
        return result;
    }
}
