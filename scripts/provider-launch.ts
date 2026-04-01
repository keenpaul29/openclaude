// @ts-nocheck
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
  env?: {
    OPENAI_BASE_URL?: string
    OPENAI_MODEL?: string
    OPENAI_API_KEY?: string
  }
}

type LaunchOptions = {
  requestedProfile: ProviderProfile | 'auto' | null
  passthroughArgs: string[]
  fast: boolean
  goal: ReturnType<typeof normalizeRecommendationGoal>
}

function parseLaunchOptions(argv: string[]): LaunchOptions {
  let requestedProfile: ProviderProfile | 'auto' | null = 'auto'
  const passthroughArgs: string[] = []
  let fast = false
  let goal = normalizeRecommendationGoal(process.env.OPENCLAUDE_PROFILE_GOAL)

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const lower = arg.toLowerCase()
    if (lower === '--fast') {
      fast = true
      continue
    }

    if (lower === '--goal') {
      goal = normalizeRecommendationGoal(argv[i + 1] ?? null)
      i++
      continue
    }

    if ((lower === 'auto' || lower === 'openai' || lower === 'ollama') && requestedProfile === 'auto') {
      requestedProfile = lower as ProviderProfile | 'auto'
      continue
    }

    if (arg.startsWith('--')) {
      passthroughArgs.push(arg)
      continue
    }

    if (requestedProfile === 'auto') {
      requestedProfile = null
      break
    }

    passthroughArgs.push(arg)
  }

  return {
    requestedProfile,
    passthroughArgs,
    fast,
    goal,
  }
}

function loadPersistedProfile(): ProfileFile | null {
  const path = resolve(process.cwd(), '.openclaude-profile.json')
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ProfileFile
    if (parsed.profile === 'openai' || parsed.profile === 'ollama') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

async function resolveOllamaDefaultModel(
  goal: ReturnType<typeof normalizeRecommendationGoal>,
): Promise<string> {
  const models = await listOllamaModels()
  const recommended = recommendOllamaModel(models, goal)
  return recommended?.name || process.env.OPENAI_MODEL || 'llama3.1:8b'
}

function runCommand(command: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise(resolve => {
    const child = spawn(command, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
      shell: true,
    })

    child.on('close', code => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

async function buildEnv(
  profile: ProviderProfile,
  persisted: ProfileFile | null,
  goal: ReturnType<typeof normalizeRecommendationGoal>,
): Promise<NodeJS.ProcessEnv> {
  const persistedEnv = persisted?.env ?? {}
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_CODE_USE_OPENAI: '1',
  }

  if (profile === 'ollama') {
    env.OPENAI_BASE_URL =
      persistedEnv.OPENAI_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      getOllamaChatBaseUrl()
    env.OPENAI_MODEL =
      persistedEnv.OPENAI_MODEL ||
      process.env.OPENAI_MODEL ||
      await resolveOllamaDefaultModel(goal)
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'SUA_CHAVE') {
      delete env.OPENAI_API_KEY
    }
    return env
  }

  env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || persistedEnv.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  env.OPENAI_MODEL =
    process.env.OPENAI_MODEL ||
    persistedEnv.OPENAI_MODEL ||
    getGoalDefaultOpenAIModel(goal)
  env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || persistedEnv.OPENAI_API_KEY
  return env
}

function applyFastFlags(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  env.CLAUDE_CODE_SIMPLE ??= '1'
  env.CLAUDE_CODE_DISABLE_THINKING ??= '1'
  env.DISABLE_INTERLEAVED_THINKING ??= '1'
  env.DISABLE_AUTO_COMPACT ??= '1'
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY ??= '1'
  env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS ??= '1'
  return env
}

function quoteArg(arg: string): string {
  if (!arg.includes(' ') && !arg.includes('"')) return arg
  return `"${arg.replace(/"/g, '\\"')}"`
}

function printSummary(profile: ProviderProfile, env: NodeJS.ProcessEnv): void {
  const keySet = Boolean(env.OPENAI_API_KEY)
  console.log(`Launching profile: ${profile}`)
  console.log(`OPENAI_BASE_URL=${env.OPENAI_BASE_URL}`)
  console.log(`OPENAI_MODEL=${env.OPENAI_MODEL}`)
  console.log(`OPENAI_API_KEY_SET=${keySet}`)
}

async function main(): Promise<void> {
  const options = parseLaunchOptions(process.argv.slice(2))
  const requestedProfile = options.requestedProfile
  if (!requestedProfile) {
    console.error('Usage: bun run scripts/provider-launch.ts [openai|ollama|auto] [--fast] [-- <cli args>]')
    process.exit(1)
  }

  const persisted = loadPersistedProfile()
  let profile: ProviderProfile

  if (requestedProfile === 'auto') {
    if (persisted) {
      profile = persisted.profile
    } else {
      profile = (await hasLocalOllama()) ? 'ollama' : 'openai'
    }
  } else {
    profile = requestedProfile
  }

  const env = await buildEnv(profile, persisted, options.goal)
  if (options.fast) {
    applyFastFlags(env)
  }

  if (profile === 'openai' && (!env.OPENAI_API_KEY || env.OPENAI_API_KEY === 'SUA_CHAVE')) {
    console.error('OPENAI_API_KEY is required for openai profile and cannot be SUA_CHAVE. Run: bun run profile:init -- --provider openai --api-key <key>')
    process.exit(1)
  }

  printSummary(profile, env)

  const doctorCode = await runCommand('bun run scripts/system-check.ts', env)
  if (doctorCode !== 0) {
    console.error('Runtime doctor failed. Fix configuration before launching.')
    process.exit(doctorCode)
  }

  const cliArgs = options.passthroughArgs.map(quoteArg).join(' ')
  const devCommand = cliArgs ? `bun run dev -- ${cliArgs}` : 'bun run dev'
  const devCode = await runCommand(devCommand, env)
  process.exit(devCode)
}

await main()

export {}
