import { promises as fs } from 'node:fs'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'

export interface SaveInput {
  buffer: Buffer
  originalFilename: string
  mimeType: string
}

export interface SavedFile {
  filepath: string
  sizeBytes: number
}

export interface IFileStore {
  save(input: SaveInput): Promise<SavedFile>
  openReadStream(filepath: string): Readable
  delete(filepath: string): Promise<void>
  resolve(filepath: string): string
}

const DEFAULT_UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads')

const SAFE_EXT_RE = /^[a-z0-9]{1,8}$/i

function pickExtension(filename: string, mimeType: string): string {
  const fromName = path.extname(filename).replace(/^\./, '').toLowerCase()
  if (fromName && SAFE_EXT_RE.test(fromName)) return fromName

  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
  }
  return map[mimeType.toLowerCase()] ?? 'bin'
}

function randomId(): string {
  return [...crypto.getRandomValues(new Uint8Array(12))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Local filesystem file store. Writes to `<root>/<yyyy>/<mm>/<random>.<ext>`.
 * Returned `filepath` is relative to `root` so it stays portable when we
 * swap to S3/R2 later (only the IFileStore impl changes).
 */
export class LocalFileStore implements IFileStore {
  constructor(private readonly root: string = DEFAULT_UPLOAD_ROOT) {}

  async save(input: SaveInput): Promise<SavedFile> {
    const now = new Date()
    const yyyy = String(now.getUTCFullYear())
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    const ext = pickExtension(input.originalFilename, input.mimeType)
    const filename = `${randomId()}.${ext}`
    const relPath = path.posix.join(yyyy, mm, filename)
    const absPath = path.join(this.root, yyyy, mm, filename)

    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, input.buffer)

    return { filepath: relPath, sizeBytes: input.buffer.byteLength }
  }

  resolve(filepath: string): string {
    const abs = path.resolve(this.root, filepath)
    if (!abs.startsWith(this.root)) {
      throw new Error('filepath escapes upload root')
    }
    return abs
  }

  openReadStream(filepath: string): Readable {
    return createReadStream(this.resolve(filepath))
  }

  async delete(filepath: string): Promise<void> {
    await fs.unlink(this.resolve(filepath)).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err
    })
  }
}

export const fileStore: IFileStore = new LocalFileStore()
