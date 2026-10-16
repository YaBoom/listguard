package com.zhuyt.listguard.advisor;

/** LLM 客户端抽象：输入 prompt，返回模型文本。不可用时抛 LlmUnavailableException。 */
public interface LlmClient {

    String complete(String prompt);

    /** LLM 不可用（未配置/网络失败/服务端错误）。 */
    class LlmUnavailableException extends RuntimeException {
        public LlmUnavailableException(String message) {
            super(message);
        }

        public LlmUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
