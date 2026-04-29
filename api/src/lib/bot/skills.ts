/**
 * Claude-Code-style skill loader for the AI secretary.
 * Skills live as `.md` files under `api/src/skills/` (or `dist/skills/` in prod).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type SkillPriority = 'high' | 'normal' | 'low'

export interface Skill {
  name: string
  description: string
  triggers: string[]
  priority: SkillPriority
  body: string
}

const MAX_MATCHED_SKILLS = 2
const PRIORITY_RANK: Record<SkillPriority, number> = { high: 3, normal: 2, low: 1 }

function skillsDir(): string {
  // dev: src/lib/bot/skills.ts → ../../skills (src/skills)
  // prod (after Dockerfile copy): dist/lib/bot/skills.js → ../../skills (dist/skills)
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', '..', 'skills'),
    join(here, '..', 'skills'),
    join(process.cwd(), 'src', 'skills'),
    join(process.cwd(), 'dist', 'skills'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

function stripQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  return v
}

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return { meta: {}, body: raw }
  const fmBlock = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).replace(/^\n/, '')

  const meta: Record<string, unknown> = {}
  const lines = fmBlock.split('\n')
  let currentListKey: string | null = null
  for (const line of lines) {
    if (!line.trim()) continue
    const listMatch = line.match(/^\s*-\s+(.*)$/)
    if (listMatch && currentListKey) {
      const arr = (meta[currentListKey] as string[] | undefined) ?? []
      arr.push(stripQuotes(listMatch[1].trim()))
      meta[currentListKey] = arr
      continue
    }
    const kvMatch = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (kvMatch) {
      const key = kvMatch[1]
      const value = kvMatch[2].trim()
      if (value === '') {
        currentListKey = key
        meta[key] = []
      } else {
        currentListKey = null
        meta[key] = stripQuotes(value)
      }
    }
  }
  return { meta, body }
}

function coercePriority(v: unknown): SkillPriority {
  if (v === 'high' || v === 'normal' || v === 'low') return v
  return 'normal'
}

function loadSkillsOnce(): Skill[] {
  const dir = skillsDir()
  let files: string[] = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
  const out: Skill[] = []
  for (const filename of files) {
    try {
      const raw = readFileSync(join(dir, filename), 'utf8')
      const { meta, body } = parseFrontmatter(raw)
      const name = typeof meta.name === 'string' ? meta.name : filename.replace(/\.md$/, '')
      const description = typeof meta.description === 'string' ? meta.description : ''
      const triggers = Array.isArray(meta.triggers) ? (meta.triggers as string[]) : []
      const priority = coercePriority(meta.priority)
      out.push({ name, description, triggers, priority, body: body.trim() })
    } catch {
      // skip malformed file
    }
  }
  return out
}

let cachedSkills: Skill[] | null = null

export function loadSkills(): Skill[] {
  if (cachedSkills === null) cachedSkills = loadSkillsOnce()
  return cachedSkills
}

export function findMatchingSkills(text: string): Skill[] {
  const skills = loadSkills()
  if (!text || skills.length === 0) return []
  const haystack = text.toLowerCase()
  const matched = skills.filter((s) =>
    s.triggers.some((t) => t && haystack.includes(t.toLowerCase())),
  )
  matched.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])
  return matched.slice(0, MAX_MATCHED_SKILLS)
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return ''
  const sections = skills.map((s) => `#### Skill: ${s.name}\n${s.body}`)
  return `### Active skills (special procedures for this question)\n${sections.join('\n\n')}`
}
