// @ts-nocheck
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getGoalDefaultOpenAIModel,
  normalizeRecommendationGoal,
  recommendOllamaModel,
} from '../src/utils/providerRecommendation.ts'
import {
  getOllamaChatBaseUrl,
  hasLocalOllama,
  listOllamaModels,
} from './provider-discovery.ts'

type ProviderProfile = 'openai' | 'ollama'

type ProfileFile = {
  profile: ProviderProfile
  env: {
    OPENAI_BASE_URL?: string
    OPENAI_MODEL?: string
    OPENAI_API_KEY?: string
  }
  createdAt: string
}

function parseArg(name: string): string | null {
  const args = process.argv.slice(2)
  const idx = args.indexOf(name)
  if (idx === -1) return null
  return args[idx + 1] ?? null
}

function parseProviderArg(): ProviderProfile | 'auto' {
  const p = parseArg('--provider')?.toLowerCase()
  if (p === 'openai' || p === 'ollama') return p
  return 'auto'
}

function sanitizeApiKey(key: string | null): string | undefined {
  if (!key || key === 'SUA_CHAVE') return undefined
  return key
}

async function resolveOllamaModel(
  argModel: string | null,
  argBaseUrl: string | null,
  goal: ReturnType<typeof normalizeRecommendationGoal>,
): Promise<string> {
  if (argModel) return argModel

  const discovered = await listOllamaModels(argBaseUrl || undefined)
  const recommended = recommendOllamaModel(discovered, goal)
  if (recommended) {
    return recommended.name
  }

  return process.env.OPENAI_MODEL || 'llama3.1:8b'
}

async function main(): Promise<void> {
  const provider = parseProviderArg()
  const argModel = parseArg('--model')
  const argBaseUrl = parseArg('--base-url')
  const argApiKey = parseArg('--api-key')
  const goal = normalizeRecommendationGoal(
    parseArg('--goal') || process.env.OPENCLAUDE_PROFILE_GOAL,
  )

  let selected: ProviderProfile
  if (provider === 'auto') {
    selected = (await hasLocalOllama(argBaseUrl || undefined)) ? 'ollama' : 'openai'
  } else {
    selected = provider
  }

  const env: ProfileFile['env'] = {}
  if (selected === 'ollama') {
    env.OPENAI_BASE_URL = getOllamaChatBaseUrl(argBaseUrl || undefined)
    env.OPENAI_MODEL = await resolveOllamaModel(argModel, argBaseUrl, goal)
    const key = sanitizeApiKey(argApiKey || process.env.OPENAI_API_KEY || null)
    if (key) env.OPENAI_API_KEY = key
  } else {
    env.OPENAI_BASE_URL = argBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    env.OPENAI_MODEL =
      argModel ||
      process.env.OPENAI_MODEL ||
      getGoalDefaultOpenAIModel(goal)
    const key = sanitizeApiKey(argApiKey || process.env.OPENAI_API_KEY || null)
    if (!key) {
      console.error('OpenAI profile requires a real API key. Use --api-key or set OPENAI_API_KEY.')
      process.exit(1)
    }
    env.OPENAI_API_KEY = key
  }

  const profile: ProfileFile = {
    profile: selected,
    env,
    createdAt: new Date().toISOString(),
  }

  const outputPath = resolve(process.cwd(), '.openclaude-profile.json')
  writeFileSync(outputPath, JSON.stringify(profile, null, 2), 'utf8')

  console.log(`Saved profile: ${selected}`)
  console.log(`Goal: ${goal}`)
  console.log(`Model: ${profile.env.OPENAI_MODEL}`)
  console.log(`Path: ${outputPath}`)
  console.log('Next: bun run dev:profile')
}

await main()

export {}
