package com.zhuyt.listguard.advisor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** OpenAI 兼容 /chat/completions 的轻量 HTTP 客户端（java.net.http + Jackson 解析）。 */
public class HttpLlmClient implements LlmClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(15);
    private static final ObjectMapper MAPPER = new ObjectMapper();

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
        try {
            ObjectNode message = MAPPER.createObjectNode();
            message.put("role", "user");
            message.put("content", prompt);
            ArrayNode messages = MAPPER.createArrayNode();
            messages.add(message);
            ObjectNode body = MAPPER.createObjectNode();
            body.put("model", model);
            body.set("messages", messages);
            body.put("temperature", 0.2);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/chat/completions"))
                    .timeout(TIMEOUT)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(MAPPER.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new LlmUnavailableException("LLM 响应异常: HTTP " + response.statusCode());
            }
            return extractContent(response.body());
        } catch (LlmUnavailableException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); // 恢复中断位再降级
            throw new LlmUnavailableException("LLM 调用被中断", e);
        } catch (Exception e) {
            throw new LlmUnavailableException("LLM 调用失败: " + e.getMessage(), e);
        }
    }

    /** Jackson 解析 choices[0].message.content，容忍 pretty-print 与任意 JSON 转义。 */
    private static String extractContent(String json) {
        try {
            JsonNode content = MAPPER.readTree(json).path("choices").path(0).path("message").path("content");
            if (content.isMissingNode() || !content.isTextual() || content.asText().isBlank()) {
                throw new LlmUnavailableException("LLM 响应缺少 content 字段");
            }
            return content.asText();
        } catch (LlmUnavailableException e) {
            throw e;
        } catch (Exception e) {
            throw new LlmUnavailableException("LLM 响应解析失败: " + e.getMessage(), e);
        }
    }
}
