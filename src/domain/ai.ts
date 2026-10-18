export type SummaryBackend = 'local' | 'model' | 'openclaw'
export type ModelProvider = 'qwen' | 'deepseek' | 'glm' | 'kimi' | 'openai' | 'claude' | 'custom'

export interface DirectModelConfig {
  provider: ModelProvider
  apiKey: string
  baseUrl: string
  model: string
}

export interface SummaryConfig {
  backend: SummaryBackend
  model?: DirectModelConfig
}

export interface ModelProviderPreset {
  id: ModelProvider
  label: string
  baseUrl: string
  model: string
  protocol: 'openai' | 'anthropic'
}

export const MODEL_PROVIDER_PRESETS: ModelProviderPreset[] = [
  { id: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-plus', protocol: 'openai' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', protocol: 'openai' },
  { id: 'glm', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.5-flash', protocol: 'openai' },
  { id: 'kimi', label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2-0711-preview', protocol: 'openai' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', protocol: 'openai' },
  { id: 'claude', label: 'Claude', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', protocol: 'anthropic' },
  { id: 'custom', label: '自定义兼容接口', baseUrl: 'http://127.0.0.1:11434/v1', model: '', protocol: 'openai' },
]

/**
 * 返回供应商默认配置，供界面切换预设时使用。
 * @author wuyc
 */
export function createModelConfig(provider: ModelProvider = 'qwen'): DirectModelConfig {
  const preset = MODEL_PROVIDER_PRESETS.find((item) => item.id === provider) || MODEL_PROVIDER_PRESETS[0]
  return { provider: preset.id, apiKey: '', baseUrl: preset.baseUrl, model: preset.model }
}
