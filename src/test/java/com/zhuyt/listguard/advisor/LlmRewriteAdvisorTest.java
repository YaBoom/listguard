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
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LlmRewriteAdvisorTest {

    private HttpServer server;
    private final AtomicInteger requests = new AtomicInteger();

    @BeforeEach
    void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/chat/completions", exchange -> {
            requests.incrementAndGet();
            byte[] body;
            if (requests.get() <= 1) {
                body = """
                        {"choices":[{"message":{"content":"{\\"suggestedText\\":\\"Wireless Earbuds\\",\\"rationale\\":\\"removed promo\\"}"}}]}
                        """.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
            } else {
                exchange.sendResponseHeaders(500, -1);
                exchange.close();
                return;
            }
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

    private HttpLlmClient stubClient() {
        return new HttpLlmClient(
                "http://localhost:" + server.getAddress().getPort() + "/v1",
                "test-key", "test-model");
    }

    @Test
    void rewrite_success_parsesSuggestion() {
        var advisor = new LlmRewriteAdvisor(stubClient());
        var finding = new Finding("promo-best-seller", "promo_word", Severity.RED,
                "title", "best seller", "促销词", "删除");
        var s = advisor.rewrite("Best Seller Wireless Earbuds", finding);
        assertTrue(s.isPresent());
        assertEquals("Wireless Earbuds", s.get().suggestedText());
    }

    @Test
    void rewrite_llmFailure_degradesToEmpty() {
        var advisor = new LlmRewriteAdvisor(stubClient());
        var finding = new Finding("promo-best-seller", "promo_word", Severity.RED,
                "title", "best seller", "促销词", "删除");
        // 第一次调用消费 200 响应，第二次触发 500
        advisor.rewrite("Best Seller a", finding);
        var s = advisor.rewrite("Best Seller b", finding);
        assertTrue(s.isEmpty());
    }

    @Test
    void rewrite_notApplicableCategory_skipsLlm() {
        var advisor = new LlmRewriteAdvisor(stubClient());
        var finding = new Finding("ai-disclosure-missing", "ai_disclosure", Severity.YELLOW,
                "aiDisclosure", "未声明", "m", "s");
        var s = advisor.rewrite("text", finding);
        assertTrue(s.isEmpty());
        assertEquals(0, requests.get());
    }
}
