import { Bot, Braces, CloudCog } from 'lucide-react'
import { MODEL_PROVIDER_PRESETS, createModelConfig, type ModelProvider, type SummaryConfig } from '../domain/ai'

interface SummaryEngineSelectorProps {
  value: SummaryConfig
  onChange: (value: SummaryConfig) => void
  disabled?: boolean
}

/**
 * 提供纯代码、直连模型和 OpenClaw 三种总结引擎配置，密钥只保留在组件内存。
 * @author wuyc
 */
export function SummaryEngineSelector({ value, onChange, disabled }: SummaryEngineSelectorProps) {
  const choose = (backend: SummaryConfig['backend']) => onChange({ backend, model: backend === 'model' ? value.model || createModelConfig() : undefined })
  const updateProvider = (provider: ModelProvider) => onChange({ backend: 'model', model: { ...createModelConfig(provider), apiKey: value.model?.apiKey || '' } })
  const updateModel = (change: Partial<NonNullable<SummaryConfig['model']>>) => onChange({ backend: 'model', model: { ...(value.model || createModelConfig()), ...change } })

  return <section className="summary-engine" aria-label="总结引擎">
    <div className="engine-options">
      <button className={value.backend === 'local' ? 'active' : ''} onClick={() => choose('local')} disabled={disabled} type="button"><Braces size={15} /><span>纯代码<small>无需模型</small></span></button>
      <button className={value.backend === 'model' ? 'active' : ''} onClick={() => choose('model')} disabled={disabled} type="button"><CloudCog size={15} /><span>配置模型<small>直连 API</small></span></button>
      <button className={value.backend === 'openclaw' ? 'active' : ''} onClick={() => choose('openclaw')} disabled={disabled} type="button"><Bot size={15} /><span>OpenClaw<small>本机代理</small></span></button>
    </div>
    {value.backend === 'model' && <div className="model-fields">
      <label>供应商<select aria-label="模型供应商" value={value.model?.provider || 'qwen'} onChange={(event) => updateProvider(event.target.value as ModelProvider)} disabled={disabled}>{MODEL_PROVIDER_PRESETS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <label>模型<input aria-label="模型名称" value={value.model?.model || ''} onChange={(event) => updateModel({ model: event.target.value })} disabled={disabled} /></label>
      <label className="base-url">接口地址<input aria-label="模型接口地址" value={value.model?.baseUrl || ''} onChange={(event) => updateModel({ baseUrl: event.target.value })} disabled={disabled} /></label>
      <label className="api-key">API Key<input aria-label="模型 API Key" type="password" autoComplete="off" value={value.model?.apiKey || ''} onChange={(event) => updateModel({ apiKey: event.target.value })} placeholder="仅用于当前页面，不保存" disabled={disabled} /></label>
    </div>}
  </section>
}
