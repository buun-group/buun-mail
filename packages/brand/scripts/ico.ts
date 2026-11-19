/** A minimal ICO writer: PNG images in an ICO container, which every current Windows and browser reads. */
export function packIco(images: readonly { size: number; png: Uint8Array }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.byteLength, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.byteLength
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => Buffer.from(png))])
}

/** The sizes in an .ico file, read back for the tests. */
export function icoSizes(file: Uint8Array): number[] {
  const view = Buffer.from(file)
  return Array.from({ length: view.readUInt16LE(4) }, (_, index) => view.readUInt8(6 + index * 16) || 256)
}
