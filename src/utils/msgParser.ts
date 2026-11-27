/**
 * Lightweight OLE2 / MAPI .msg parser (no external dependencies).
 * Extracts Subject, Body, Sender, Date and embedded file attachments
 * from Outlook Desktop .msg files dragged into the browser.
 */

const ENDOFCHAIN = 0xfffffffe
const FREESECT = 0xffffffff
const NOSTREAM = 0xffffffff

interface DirEntry {
  name: string
  type: number // 0 empty, 1 storage, 2 stream, 5 root
  left: number
  right: number
  child: number
  start: number
  size: number
}

export interface MsgAttachment {
  name: string
  mime?: string
  data: Uint8Array
}

export interface ParsedMsg {
  subject?: string
  body?: string
  sender?: string
  date?: string
  attachments: MsgAttachment[]
}

export function parseOutlookMsg(buffer: ArrayBuffer): ParsedMsg {
  const empty: ParsedMsg = { attachments: [] }
  if (buffer.byteLength < 512) return empty
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // OLE2 magic: D0 CF 11 E0 A1 B1 1A E1
  const magic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  if (magic.some((b, i) => bytes[i] !== b)) return empty

  const sectorSize = 1 << view.getUint16(0x1e, true)
  const miniSectorSize = 1 << view.getUint16(0x20, true)
  const numFatSectors = view.getUint32(0x2c, true)
  const firstDirSector = view.getUint32(0x30, true)
  const miniCutoff = view.getUint32(0x38, true)
  const firstMiniFatSector = view.getUint32(0x3c, true)
  const firstDifatSector = view.getUint32(0x44, true)
  const numDifatSectors = view.getUint32(0x48, true)
  const entriesPerSector = sectorSize / 4

  // ---- FAT sector list (header DIFAT + DIFAT chain for large files) ----
  const fatSectorList: number[] = []
  for (let i = 0; i < 109; i++) {
    const v = view.getUint32(0x4c + i * 4, true)
    if (v !== FREESECT && v !== ENDOFCHAIN) fatSectorList.push(v)
  }
  let difSec = firstDifatSector
  let guard = 0
  while (difSec !== ENDOFCHAIN && difSec !== FREESECT && guard <= numDifatSectors && guard < 10000) {
    const base = (difSec + 1) * sectorSize
    if (base + sectorSize > bytes.length) break
    for (let j = 0; j < entriesPerSector - 1; j++) {
      const v = view.getUint32(base + j * 4, true)
      if (v !== FREESECT && v !== ENDOFCHAIN) fatSectorList.push(v)
    }
    difSec = view.getUint32(base + (entriesPerSector - 1) * 4, true)
    guard++
  }
  const fat: number[] = []
  for (const fs of fatSectorList.slice(0, numFatSectors || fatSectorList.length)) {
    const base = (fs + 1) * sectorSize
    if (base + sectorSize > bytes.length) continue
    for (let j = 0; j < entriesPerSector; j++) fat.push(view.getUint32(base + j * 4, true))
  }
  if (fat.length === 0) return empty

  const chain = (start: number, table: number[]): number[] => {
    const out: number[] = []
    const seen = new Set<number>()
    let s = start
    while (s >= 0 && s < table.length && s !== ENDOFCHAIN && s !== FREESECT && !seen.has(s)) {
      seen.add(s)
      out.push(s)
      s = table[s]
    }
    return out
  }

  const readRegular = (start: number, size: number): Uint8Array => {
    const secs = chain(start, fat)
    const total = size > 0 ? size : secs.length * sectorSize
    const out = new Uint8Array(total)
    let written = 0
    for (const s of secs) {
      if (written >= total) break
      const offset = (s + 1) * sectorSize
      if (offset >= bytes.length) break
      const len = Math.min(sectorSize, total - written, bytes.length - offset)
      out.set(bytes.subarray(offset, offset + len), written)
      written += len
    }
    return out.subarray(0, written)
  }

  // ---- Directory ----
  const dirBytes = readRegular(firstDirSector, 0)
  const dirView = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength)
  const utf16 = new TextDecoder('utf-16le')
  const latin = new TextDecoder('windows-1252')
  const entries: DirEntry[] = []
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const nameLen = dirView.getUint16(off + 0x40, true)
    entries.push({
      name: nameLen >= 2 && nameLen <= 64 ? utf16.decode(dirBytes.subarray(off, off + nameLen - 2)) : '',
      type: dirBytes[off + 0x42],
      left: dirView.getUint32(off + 0x44, true),
      right: dirView.getUint32(off + 0x48, true),
      child: dirView.getUint32(off + 0x4c, true),
      start: dirView.getUint32(off + 0x74, true),
      size: dirView.getUint32(off + 0x78, true),
    })
  }
  const root = entries[0]
  if (!root || root.type !== 5) return empty

  // ---- Mini stream ----
  const miniFat: number[] = []
  for (const s of chain(firstMiniFatSector, fat)) {
    const base = (s + 1) * sectorSize
    if (base + sectorSize > bytes.length) break
    for (let j = 0; j < entriesPerSector; j++) miniFat.push(view.getUint32(base + j * 4, true))
  }
  const miniStream = root.size > 0 ? readRegular(root.start, root.size) : new Uint8Array(0)

  const readMini = (start: number, size: number): Uint8Array => {
    const out = new Uint8Array(size)
    let written = 0
    for (const s of chain(start, miniFat)) {
      if (written >= size) break
      const offset = s * miniSectorSize
      if (offset >= miniStream.length) break
      const len = Math.min(miniSectorSize, size - written, miniStream.length - offset)
      out.set(miniStream.subarray(offset, offset + len), written)
      written += len
    }
    return out.subarray(0, written)
  }

  const readEntry = (e: DirEntry): Uint8Array =>
    e.size < miniCutoff ? readMini(e.start, e.size) : readRegular(e.start, e.size)

  // Children of a storage are stored as a red-black tree under `child`
  const childrenOf = (idx: number): number[] => {
    const out: number[] = []
    const seen = new Set<number>()
    const stack = [entries[idx]?.child ?? NOSTREAM]
    while (stack.length) {
      const c = stack.pop()!
      if (c === NOSTREAM || c >= entries.length || seen.has(c)) continue
      seen.add(c)
      out.push(c)
      stack.push(entries[c].left, entries[c].right)
    }
    return out
  }

  const streamsOf = (idx: number): Map<string, DirEntry> => {
    const m = new Map<string, DirEntry>()
    for (const c of childrenOf(idx)) {
      if (entries[c].type === 2) m.set(entries[c].name.toUpperCase(), entries[c])
    }
    return m
  }

  const readString = (m: Map<string, DirEntry>, propHex: string): string | undefined => {
    const uni = m.get(`__SUBSTG1.0_${propHex}001F`)
    if (uni && uni.size > 0) return utf16.decode(readEntry(uni)).replace(/\0+$/, '').trim()
    const ansi = m.get(`__SUBSTG1.0_${propHex}001E`)
    if (ansi && ansi.size > 0) return latin.decode(readEntry(ansi)).replace(/\0+$/, '').trim()
    return undefined
  }

  const top = streamsOf(0)

  const subject = readString(top, '0037')
  const senderName = readString(top, '0C1A')
  const senderEmail = readString(top, '0C1F')
  const validEmail = senderEmail && !senderEmail.startsWith('/') ? senderEmail : undefined
  const sender =
    senderName && validEmail && !senderName.includes(validEmail)
      ? `${senderName} <${validEmail}>`
      : senderName || validEmail
  const headers = readString(top, '007D')
  const date = headers?.match(/^Date:\s*(.+)$/im)?.[1]?.trim()

  let body = readString(top, '1000')
  if (!body) {
    const htmlBody = readString(top, '1013')
    if (htmlBody) {
      body = htmlBody
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
    }
  }

  // ---- Embedded file attachments ----
  const attachments: MsgAttachment[] = []
  for (const c of childrenOf(0)) {
    const e = entries[c]
    if (e.type !== 1 || !e.name.toUpperCase().startsWith('__ATTACH_VERSION1.0_')) continue
    const am = streamsOf(c)
    const dataEntry = am.get('__SUBSTG1.0_37010102')
    if (!dataEntry || dataEntry.size === 0) continue // skip embedded messages / OLE objects
    const name = readString(am, '3707') || readString(am, '3704') || 'attachment'
    const mime = readString(am, '370E')
    const contentId = readString(am, '3712')
    // Skip inline signature images (logos etc.)
    if (contentId && /\.(png|jpe?g|gif|bmp)$/i.test(name)) continue
    attachments.push({ name, mime, data: readEntry(dataEntry) })
  }

  return { subject, body, sender, date, attachments }
}
