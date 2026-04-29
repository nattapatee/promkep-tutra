/**
 * Thin fetch wrapper around Google AI Studio's REST API.
 * Two exports:
 *   - geminiChat           — single-shot text generation.
 *   - geminiChatWithTools  — multi-turn loop with function-calling support.
 */

const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
const DEFAULT_TEMPERATURE = 0.4
const DEFAULT_MAX_OUTPUT_TOKENS = 2048
const REQUEST_TIMEOUT_MS = 15_000
const TOOL_MAX_ITERATIONS = 4

type Role = 'user' | 'model'

interface GeminiTextPart {
  text?: string
}

interface GeminiFunctionCall {
  name: string
  args?: Record<string, unknown>
}

interface GeminiFunctionResponse {
  name: string
  response: { result: unknown }
}

interface GeminiPart {
  text?: string
  functionCall?: GeminiFunctionCall
  functionResponse?: GeminiFunctionResponse
}

interface GeminiContent {
  role: 'user' | 'model' | 'function'
  parts: GeminiPart[]
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[]; role?: string }
  finishReason?: string
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  promptFeedback?: { blockReason?: string }
}

export interface GeminiChatOptions {
  systemPrompt: string
  userMessage: string
  temperature?: number
  maxOutputTokens?: number
  model?: string
}

export type GeminiResult = { text: string } | { error: string }

interface ToolFunctionDecl {
  name: string
  description: string
  parameters: unknown
}

export interface GeminiChatWithToolsOptions {
  systemPrompt: string
  messages: Array<{ role: Role; text: string }>
  tools: ToolFunctionDecl[]
  executeTool: (name: string, args: unknown) => Promise<unknown>
  temperature?: number
  maxOutputTokens?: number
  model?: string
}

interface CallParams {
  apiKey: string
  url: string
  body: unknown
}

async function callGemini(params: CallParams): Promise<GeminiResponse | { error: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(params.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': params.apiKey,
      },
      body: JSON.stringify(params.body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { error: `http_${res.status}:${detail.slice(0, 200)}` }
    }
    const data = (await res.json()) as GeminiResponse
    return data
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    return { error: `fetch_failed:${message}` }
  } finally {
    clearTimeout(timeout)
  }
}

function modelUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
}

export async function geminiChat(opts: GeminiChatOptions): Promise<GeminiResult> {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim()
  if (!apiKey) return { error: 'no_key' }

  const model = opts.model ?? DEFAULT_MODEL
  const body = {
    contents: [{ role: 'user', parts: [{ text: opts.userMessage }] }],
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    generationConfig: {
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      maxOutputTokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      responseMimeType: 'text/plain',
    },
  }

  const data = await callGemini({ apiKey, url: modelUrl(model), body })
  if ('error' in data) return data

  const blockReason = data.promptFeedback?.blockReason
  if (blockReason) return { error: `blocked:${blockReason}` }

  const parts = data.candidates?.[0]?.content?.parts as GeminiTextPart[] | undefined
  const text = parts?.map((p) => p.text ?? '').join('').trim()
  if (!text) return { error: 'empty_response' }
  return { text }
}

/**
 * Multi-turn function-calling loop.
 */
export async function geminiChatWithTools(
  opts: GeminiChatWithToolsOptions,
): Promise<GeminiResult> {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim()
  if (!apiKey) return { error: 'no_key' }

  const model = opts.model ?? DEFAULT_MODEL
  const url = modelUrl(model)

  const contents: GeminiContent[] = opts.messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }))

  for (let iter = 0; iter < TOOL_MAX_ITERATIONS; iter++) {
    const body = {
      contents,
      systemInstruction: { parts: [{ text: opts.systemPrompt }] },
      tools:
        opts.tools.length > 0
          ? [{ functionDeclarations: opts.tools }]
          : undefined,
      generationConfig: {
        temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
        maxOutputTokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      },
    }

    const data = await callGemini({ apiKey, url, body })
    if ('error' in data) return data

    const blockReason = data.promptFeedback?.blockReason
    if (blockReason) return { error: `blocked:${blockReason}` }

    const candidate = data.candidates?.[0]
    const parts = candidate?.content?.parts ?? []
    const finish = candidate?.finishReason ?? 'unknown'
    if (parts.length === 0) return { error: `empty_response:${finish}` }

    const functionCalls: GeminiFunctionCall[] = []
    const textChunks: string[] = []
    for (const p of parts) {
      if (p.functionCall && p.functionCall.name) functionCalls.push(p.functionCall)
      else if (p.text) textChunks.push(p.text)
    }

    if (functionCalls.length === 0) {
      const text = textChunks.join('').trim()
      if (!text) return { error: `empty_response:${finish}` }
      return { text }
    }

    contents.push({
      role: 'model',
      parts: functionCalls.map((fc) => ({ functionCall: fc })),
    })

    const responseParts: GeminiPart[] = []
    for (const fc of functionCalls) {
      let result: unknown
      try {
        result = await opts.executeTool(fc.name, fc.args ?? {})
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown'
        result = { error: 'tool_threw', message }
      }
      responseParts.push({
        functionResponse: { name: fc.name, response: { result } },
      })
    }
    contents.push({ role: 'user', parts: responseParts })
  }

  return { error: 'tool_loop_exhausted' }
}
