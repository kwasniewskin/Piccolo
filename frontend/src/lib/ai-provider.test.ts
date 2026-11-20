import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiProviderError, callVisionJsonModel } from './ai-provider'

const ORIGINAL_ENV = { ...process.env }

function mockResponse(status: number, body: unknown): Response {
  return new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

describe('callVisionJsonModel', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.AI_PROVIDER
    delete process.env.GEMINI_MODEL
    delete process.env.OPENAI_MEAL_MODEL
    delete process.env.OPENAI_LABEL_MODEL
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('wybiera Gemini dla preferredProvider=gemini, filtruje bloki thought i konwertuje obrazy inline_data', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    process.env.OPENAI_API_KEY = 'test-openai-key'

    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockResponse(200, {
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: 'analizuję kartkę...' },
                { text: '```json\n{"dishName":"Owsianka"}\n```' },
              ],
            },
          },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await callVisionJsonModel<{ dishName: string }>({
      systemPrompt: 'sys',
      userText: 'user',
      images: ['data:image/jpeg;base64,ABC123'],
      preferredProvider: 'gemini',
      preferFlagship: true,
    })

    expect(res.provider).toBe('gemini')
    expect(res.model).toBe('gemini-3-flash-preview')
    expect(res.data).toEqual({ dishName: 'Owsianka' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('gemini-3-flash-preview:generateContent')
    const sentBody = JSON.parse(String(init?.body))
    expect(sentBody.contents[0].parts[1]).toEqual({
      inline_data: { mime_type: 'image/jpeg', data: 'ABC123' },
    })
  })

  it('przełącza się na kolejny model Gemini gdy pierwszy zwróci 503', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    delete process.env.OPENAI_API_KEY

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(503, { error: { code: 503 } }))
      .mockResolvedValueOnce(
        mockResponse(200, {
          candidates: [
            { content: { parts: [{ text: '{"ok":true}' }] } },
          ],
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const res = await callVisionJsonModel<{ ok: boolean }>({
      systemPrompt: 'sys',
      userText: 'user',
      preferredProvider: 'gemini',
    })

    expect(res.provider).toBe('gemini')
    expect(res.model).toBe('gemini-3.8-flash')
    expect(res.data).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('robi fallback z Gemini na OpenAI gdy wszystkie modele Gemini zawiodą (503/429)', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    process.env.OPENAI_API_KEY = 'test-openai-key'

    const fetchMock = vi
      .fn()
      // 4 modele w łańcuchu Gemini zwracają 503
      .mockResolvedValueOnce(mockResponse(503, { error: 'busy' }))
      .mockResolvedValueOnce(mockResponse(503, { error: 'busy' }))
      .mockResolvedValueOnce(mockResponse(503, { error: 'busy' }))
      .mockResolvedValueOnce(mockResponse(503, { error: 'busy' }))
      // 5. strzał trafia do OpenAI
      .mockResolvedValueOnce(
        mockResponse(200, {
          choices: [{ message: { content: '{"provider":"fallback"}' } }],
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const res = await callVisionJsonModel<{ provider: string }>({
      systemPrompt: 'sys',
      userText: 'user',
      preferredProvider: 'gemini',
      preferFlagship: true,
    })

    expect(res.provider).toBe('openai')
    expect(res.model).toBe('gpt-4o')
    expect(res.data).toEqual({ provider: 'fallback' })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('wybiera OpenAI gpt-4o-mini dla preferredProvider=openai i robi fallback na Gemini przy 429', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.GEMINI_API_KEY = 'test-gemini-key'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(429, { error: 'quota_exceeded' }))
      .mockResolvedValueOnce(
        mockResponse(200, {
          candidates: [
            { content: { parts: [{ text: '{"name":"Serek Protein+"}' }] } },
          ],
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const res = await callVisionJsonModel<{ name: string }>({
      systemPrompt: 'sys',
      userText: 'user',
      preferredProvider: 'openai',
      preferFlagship: false,
    })

    const [, openAiInit] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(openAiInit?.body)).model).toBe('gpt-4o-mini')
    expect(res.provider).toBe('gemini')
    expect(res.data).toEqual({ name: 'Serek Protein+' })
  })

  it('rzuca AiProviderError(500) gdy brak kluczy API lub odpowiedź nie jest poprawnym JSON-em', async () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.GEMINI_API_KEY

    await expect(
      callVisionJsonModel({ systemPrompt: 'sys', userText: 'user' })
    ).rejects.toMatchObject({ name: 'AiProviderError', status: 500 })

    process.env.GEMINI_API_KEY = 'test-gemini-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          mockResponse(200, {
            candidates: [{ content: { parts: [{ text: 'nie-json' }] } }],
          })
        )
      )
    )

    await expect(
      callVisionJsonModel({
        systemPrompt: 'sys',
        userText: 'user',
        preferredProvider: 'gemini',
      })
    ).rejects.toBeInstanceOf(AiProviderError)
  })
})
