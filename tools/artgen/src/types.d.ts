declare module 'potrace' {
  export class Potrace {
    constructor(opts?: Record<string, unknown>);
    loadImage(src: unknown, cb: (err: Error | null) => void): void;
    getSVG(): string;
    getPathTag(fillColor?: string): string;
  }
}

declare module 'jimp' {
  class JimpClass {
    static MIME_PNG: string;
    static read(src: unknown): Promise<JimpClass>;
    constructor(width: number, height: number, bg?: number);
    bitmap: { width: number; height: number; data: Buffer };
    setPixelColor(hex: number, x: number, y: number): JimpClass;
    getBufferAsync(mime: string): Promise<Buffer>;
  }
  const Jimp: typeof JimpClass;
  export default Jimp;
}
