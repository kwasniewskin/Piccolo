export type VisionJsonOptions = {
  systemPrompt: string
  userText: string
  images?: string[]
  preferredProvider?: 'gemini' | 'openai'
  preferFlagship?: boolean
  maxTokens?: number
}

export type AiProviderResult<T> = {
  data: T
  provider: 'openai' | 'gemini'
  model: string
}

export class AiProviderError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'AiProviderError'
    this.status = status
  }
}

function stripMarkdownFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function parseJsonResponse<T>(rawContent: string, providerName: string): T {
  const cleaned = stripMarkdownFences(rawContent)
  try {
    return JSON.parse(cleaned) as T
  } catch (err) {
    console.error(`[AI:${providerName}] JSON parse error:`, err, 'Raw:', rawContent)
    throw new AiProviderError('Failed to parse AI API response', 500)
  }
}

function parseDataUrl(imageUrl: string): { mimeType: string; data: string } | null {
  const match = imageUrl.match(/^data:([^;]+);base64,([\s\S]+)$/)
  if (match) {
    return { mimeType: match[1], data: match[2].trim() }
  }
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    return { mimeType: 'image/jpeg', data: imageUrl }
  }
  return null
}

async function callOpenAiVisionJson<T>(
  apiKey: string,
  options: VisionJsonOptions
): Promise<AiProviderResult<T>> {
  const model = options.preferFlagship
    ? process.env.OPENAI_MEAL_MODEL || 'gpt-4o'
    : process.env.OPENAI_LABEL_MODEL || 'gpt-4o-mini'

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: options.userText }]

  for (const image of options.images ?? []) {
    if (image) {
      userContent.push({
        type: 'image_url',
        image_url: { url: image },
      })
    }
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: options.maxTokens ?? 2500,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[AI:openai] HTTP ${response.status}:`, errorText)
    throw new AiProviderError('AI analysis failed (OpenAI)', response.status)
  }

  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content

  if (!content || typeof content !== 'string') {
    throw new AiProviderError('Empty response from OpenAI API', 500)
  }

  return {
    data: parseJsonResponse<T>(content, 'openai'),
    provider: 'openai',
    model,
  }
}

const RETRYABLE_PROVIDER_STATUSES = new Set([401, 403, 404, 429, 500, 502, 503, 504])
const GEMINI_REQUEST_TIMEOUT_MS = 15000
const GEMINI_FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
]

async function callSingleGeminiModel<T>(
  apiKey: string,
  model: string,
  options: VisionJsonOptions
): Promise<AiProviderResult<T>> {
  const parts: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  > = [{ text: options.userText }]

  for (const image of options.images ?? []) {
    if (!image) continue
    const parsed = parseDataUrl(image)
    if (parsed) {
      parts.push({
        inline_data: {
          mime_type: parsed.mimeType,
          data: parsed.data,
        },
      })
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal:
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS)
          : undefined,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: options.systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: Math.max(options.maxTokens ?? 4096, 8192),
        },
      }),
    })
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AiProviderError('AI analysis timed out (Gemini)', 504)
    }
    throw err
  }

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[AI:gemini:${model}] HTTP ${response.status}:`, errorText)
    throw new AiProviderError('AI analysis failed (Gemini)', response.status)
  }

  const payload = await response.json()
  const candidateParts = payload.candidates?.[0]?.content?.parts as
    | Array<{ text?: string; thought?: boolean }>
    | undefined

  const content = candidateParts
    ?.filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim()

  if (!content) {
    throw new AiProviderError('Empty response from Gemini API', 500)
  }

  return {
    data: parseJsonResponse<T>(content, 'gemini'),
    provider: 'gemini',
    model,
  }
}

async function callGeminiVisionJson<T>(
  apiKey: string,
  options: VisionJsonOptions
): Promise<AiProviderResult<T>> {
  const customModel = process.env.GEMINI_MODEL?.trim()
  const candidateModels = Array.from(
    new Set([
      ...(customModel ? [customModel] : []),
      ...GEMINI_FALLBACK_MODELS,
    ])
  )

  let lastError: unknown
  for (const model of candidateModels) {
    try {
      return await callSingleGeminiModel<T>(apiKey, model, options)
    } catch (error) {
      lastError = error
      if (
        error instanceof AiProviderError &&
        RETRYABLE_PROVIDER_STATUSES.has(error.status)
      ) {
        console.warn(
          `[AI:gemini] Model ${model} returned HTTP ${error.status}, trying next Gemini model...`
        )
        continue
      }
      throw error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiProviderError('AI analysis failed (Gemini)', 503)
}

/**
 * Invokes a multimodal model that returns raw JSON.
 * Selects provider via AI_PROVIDER or preferredProvider (with automatic fallback).
 */
export async function callVisionJsonModel<T>(
  options: VisionJsonOptions
): Promise<AiProviderResult<T>> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  const forcedProvider = process.env.AI_PROVIDER?.trim().toLowerCase()
  const forcedGemini = forcedProvider === 'gemini'
  const forcedOpenAi = forcedProvider === 'openai'

  const useGeminiFirst =
    forcedGemini || (options.preferredProvider === 'gemini' && !forcedOpenAi)

  if ((useGeminiFirst && geminiKey) || (!openaiKey && geminiKey)) {
    try {
      return await callGeminiVisionJson<T>(geminiKey, options)
    } catch (error) {
      if (
        error instanceof AiProviderError &&
        RETRYABLE_PROVIDER_STATUSES.has(error.status) &&
        openaiKey
      ) {
        console.warn(
          `[AI] Gemini returned ${error.status}, falling back to OpenAI`
        )
        return callOpenAiVisionJson<T>(openaiKey, options)
      }
      throw error
    }
  }

  if (!openaiKey) {
    console.error('[AI] Missing both OPENAI_API_KEY and GEMINI_API_KEY')
    throw new AiProviderError('AI server configuration error (missing API key)', 500)
  }

  try {
    return await callOpenAiVisionJson<T>(openaiKey, options)
  } catch (error) {
    if (
      error instanceof AiProviderError &&
      RETRYABLE_PROVIDER_STATUSES.has(error.status) &&
      geminiKey
    ) {
      console.warn(
        `[AI] OpenAI returned ${error.status}, falling back to Gemini`
      )
      return callGeminiVisionJson<T>(geminiKey, options)
    }
    throw error
  }
}
