/**
 * Agent LLM 配置
 * 可在此直接修改模型和 API 地址，环境变量会覆盖此处的值
 */

export default {
  /** API 地址（智谱文档：https://open.bigmodel.cn/api/paas/v4/chat/completions） */
  apiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',

  /** 使用的模型，如 glm-4、glm-4-plus、glm-4-flash、glm-4.7 等 */
  model: 'glm-4.7',

  /** API Key 从环境变量读取，支持 ZHIPU_API_KEY / OPENAI_API_KEY */
  get apiKey() {
    return (
      process.env.ZHIPU_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.DASHSCOPE_API_KEY
    )
  },
}
