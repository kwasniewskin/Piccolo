import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

const ORIGINAL_ENV = { ...process.env }

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/analyze-label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/analyze-label', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      OPENAI_API_KEY: 'test-openai-key',
    }
    delete process.env.GEMINI_API_KEY
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('zwraca 400 gdy brak obrazów w żądaniu', async () => {
    const res = await POST(makeRequest({ images: [] }))
    expect(res.status).toBe(400)
  })

  it('używa OpenAI gpt-4o-mini i uzupełnia brakujące pola domyślnymi wartościami', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  name: 'Serek Protein+',
                  calories: 128,
                  protein: 15.5,
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(
      makeRequest({ images: ['data:image/jpeg;base64,LABEL123'] })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({
      name: 'Serek Protein+',
      manufacturer: '',
      ingredients: '',
      calories: 128,
      protein: 15.5,
      fat: 0,
      carbs: 0,
      weight: 0,
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init?.body)).model).toBe('gpt-4o-mini')
  })
})
