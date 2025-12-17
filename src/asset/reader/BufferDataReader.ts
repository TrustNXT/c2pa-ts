import { AssetDataReader } from './AssetDataReader';

export class BufferDataReader implements AssetDataReader {
    constructor(private buffer: Uint8Array) {}

    async load(): Promise<void> {
        /* no-op - buffer already available */
    }

    getDataLength(): number {
        return this.buffer.length;
    }

    async getDataRange(start?: number, length?: number): Promise<Uint8Array> {
        if (start === undefined) return this.buffer;
        if (length === undefined) return this.buffer.subarray(start);
        length = Math.min(length, this.buffer.length - start);
        return this.buffer.subarray(start, start + length);
    }

    getData(): Uint8Array {
        return this.buffer;
    }

    setData(data: Uint8Array): void {
        this.buffer = data;
    }

    getBlob(): Blob | undefined {
        return undefined;
    }

    assemble(parts: { position: number; data?: Uint8Array; length?: number }[]): AssetDataReader {
        const totalLength = parts.reduce((acc, p) => Math.max(acc, p.position + (p.length ?? p.data?.length ?? 0)), 0);
        const result = new Uint8Array(totalLength);

        // Copy original data (preserves gaps)
        result.set(this.buffer.subarray(0, totalLength));

        // Apply patches
        for (const part of parts) {
            if (part.data) result.set(part.data, part.position);
            else if (part.length) result.fill(0, part.position, part.position + part.length);
        }

        return new BufferDataReader(result);
    }
}
