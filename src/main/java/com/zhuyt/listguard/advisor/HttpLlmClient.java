package com.zhuyt.listguard.advisor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** OpenAI 兼容 /chat/completions 的轻量 HTTP 客户端（java.net.http，零额外依赖）。 */
public class HttpLlmClient implements LlmClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(15);

    private final String baseUrl;
    private final String apiKey;
    private final String model;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(TIMEOUT)
            .build();

    public HttpLlmClient(String baseUrl, String apiKey, String model) {
        this.baseUrl = baseUrl == null ? "" : baseUrl.replaceAll("/+$", "");
        this.apiKey = apiKey == null ? "" : apiKey;
        this.model = model == null ? "" : model;
    }

    /** 从环境变量构造：LISTGUARD_LLM_BASE_URL / LISTGUARD_LLM_API_KEY / LISTGUARD_LLM_MODEL，缺任一即不可用。 */
    public static HttpLlmClient fromEnv() {
        String baseUrl = System.getenv("LISTGUARD_LLM_BASE_URL");
        String apiKey = System.getenv("LISTGUARD_LLM_API_KEY");
        String model = System.getenv("LISTGUARD_LLM_MODEL");
        if (baseUrl == null || baseUrl.isBlank() || apiKey == null || apiKey.isBlank() || model == null || model.isBlank()) {
            throw new LlmClient.LlmUnavailableException(
                    "LLM 未配置：需要 LISTGUARD_LLM_BASE_URL / LISTGUARD_LLM_API_KEY / LISTGUARD_LLM_MODEL");
        }
        return new HttpLlmClient(baseUrl, apiKey, model);
    }

    @Override
    public String complete(String prompt) {
        String body = "{\"model\":\"" + model + "\",\"messages\":[{\"role\":\"user\",\"content\":"
                + jsonEscape(prompt) + "}],\"temperature\":0.2}";
        HttpRequest request;
        try {
            request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/chat/completions"))
                    .timeout(TIMEOUT)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new LlmUnavailableException("LLM 响应异常: HTTP " + response.statusCode());
            }
            return extractContent(response.body());
        } catch (LlmUnavailableException e) {
            throw e;
        } catch (Exception e) {
            throw new LlmUnavailableException("LLM 调用失败: " + e.getMessage(), e);
        }
    }

    /** 极简 content 提取：取 "content":" 到下一个未转义引号之间。 */
    private static String extractContent(String json) {
        String key = "\"content\":\"";
        int start = json.indexOf(key);
        if (start < 0) {
            throw new LlmUnavailableException("LLM 响应缺少 content 字段");
        }
        start += key.length();
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '\\' && i + 1 < json.length()) {
                sb.append(json.charAt(++i) == 'n' ? '\n' : json.charAt(i));
                continue;
            }
            if (c == '"') {
                return sb.toString();
            }
            sb.append(c);
        }
        throw new LlmUnavailableException("LLM 响应 content 未闭合");
    }

    private static String jsonEscape(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.append('"').toString();
    }
}
