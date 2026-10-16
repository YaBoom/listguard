package com.zhuyt.listguard.advisor;

import com.sun.net.httpserver.HttpServer;
import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.Severity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LlmRewriteAdvisorTest {

    private record StubResponse(int status, String body) {}

    private HttpServer server;
    private final Deque<StubResponse> responses = new ArrayDeque<>();
    private final AtomicInteger requests = new AtomicInteger();

    @BeforeEach
    void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/chat/completions", exchange -> {
            requests.incrementAndGet();
            StubResponse r = responses.poll();
            if (r == null) {
                exchange.sendResponseHeaders(500, -1);
                exchange.close();
                return;
            }
            byte[] body = r.body().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(r.status(), body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        });
        server.start();
    }

    @AfterEach
    void stopStub() {
        server.stop(0);
    }

    private void enqueueContent(String content) {
        // content 是 LLM 返回的 message.content 字符串，按 JSON 语义转义后包进 OpenAI 响应
        String escaped = content.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\t", "\\t")
                .replace("\r", "\\r");
        responses.add(new StubResponse(200,
                "{\"choices\":[{\"message\":{\"content\":\"" + escaped + "\"}}]}"));
    }

    private void enqueueRaw(int status, String body) {
        responses.add(new StubResponse(status, body));
    }

    private HttpLlmClient stubClient() {
        return new HttpLlmClient(
                "http://localhost:" + server.getAddress().getPort() + "/v1",
                "test-key", "test-model");
    }

    private Finding promoFinding() {
        return new Finding("promo-best-seller", "promo_word", Severity.RED,
                "title", "best seller", "促销词", "删除");
    }

    @Test
    void rewrite_success_parsesSuggestion() {
        enqueueContent("{\"suggestedText\":\"Wireless Earbuds\",\"rationale\":\"removed promo\"}");
        var s = new LlmRewriteAdvisor(stubClient()).rewrite("Best Seller Wireless Earbuds", promoFinding());
        assertTrue(s.isPresent());
        assertEquals("Wireless Earbuds", s.get().suggestedText());
    }

    @Test
    void rewrite_prettyJsonAndEscapes_parsedCorrectly() {
        // pretty-print（键后带空格）+ tab/CR/unicode 转义：手写解析会损坏或失败，Jackson 必须正确还原。
        // 注意：Java 源码（含注释）里不能直接写 unicode 转义序列，用拼接构造字面量。
        String inner = "{\"suggestedText\":\"a\\tb\\rc" + '\\' + "u4e2d" + '\\' + "u6587"
                + "\",\"rationale\":\"ok\"}";
        String escaped = inner.replace("\\", "\\\\").replace("\"", "\\\"");
        // 单行但键后带空格：足以让 "content":" 式手写定位失效，Jackson 必须正确解析
        enqueueRaw(200, "{\"choices\": [{\"message\": {\"content\": \"" + escaped + "\"}}]}");
        var s = new LlmRewriteAdvisor(stubClient()).rewrite("Best Seller x", promoFinding());
        assertTrue(s.isPresent());
        assertEquals("a\tb\rc中文", s.get().suggestedText());
    }

    @Test
    void rewrite_suggestedTextEqualsOriginal_degradesToEmpty() {
        enqueueContent("{\"suggestedText\":\"Best Seller Wireless Earbuds\",\"rationale\":\"no change\"}");
        var s = new LlmRewriteAdvisor(stubClient()).rewrite("Best Seller Wireless Earbuds", promoFinding());
        assertTrue(s.isEmpty());
    }

    @Test
    void rewrite_malformedJsonContent_degradesToEmpty() {
        enqueueContent("抱歉，我无法输出 JSON。");
        var s = new LlmRewriteAdvisor(stubClient()).rewrite("Best Seller x", promoFinding());
        assertTrue(s.isEmpty());
    }

    @Test
    void rewrite_llmFailure_degradesToEmpty() {
        enqueueContent("{\"suggestedText\":\"A\",\"rationale\":\"r\"}");
        enqueueRaw(500, "");
        var advisor = new LlmRewriteAdvisor(stubClient());
        advisor.rewrite("Best Seller a", promoFinding()); // 200
        var s = advisor.rewrite("Best Seller b", promoFinding()); // 500
        assertTrue(s.isEmpty());
    }

    @Test
    void rewrite_notApplicableCategory_skipsLlm() {
        var finding = new Finding("ai-disclosure-missing", "ai_disclosure", Severity.YELLOW,
                "aiDisclosure", "未声明", "m", "s");
        var s = new LlmRewriteAdvisor(stubClient()).rewrite("text", finding);
        assertTrue(s.isEmpty());
        assertEquals(0, requests.get());
    }
}
