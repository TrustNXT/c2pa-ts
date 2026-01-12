import { AssemblePart, AssetDataReader } from './AssetDataReader';

export class BufferDataReader implements AssetDataReader {
    constructor(private readonly buffer: Uint8Array) {}

    getDataLength(): number {
        return this.buffer.length;
    }

    async getDataRange(start?: number, length?: number): Promise<Uint8Array> {
        if (start === undefined) return this.buffer;
        if (length === undefined) return this.buffer.subarray(start);
        length = Math.min(length, this.buffer.length - start);
        return this.buffer.subarray(start, start + length);
    }

    replaceRange(position: number, data: Uint8Array): void {
        this.buffer.set(data, position);
    }

    async getBlob(): Promise<Blob | undefined> {
        return undefined;
    }

    async writeToStream(stream: WritableStream<Uint8Array>): Promise<void> {
        const writer = stream.getWriter();
        try {
            await writer.write(this.buffer);
        } finally {
            await writer.close();
        }
    }

    assemble(parts: AssemblePart[]): AssetDataReader {
        const sorted = [...parts].sort((a, b) => a.position - b.position);
        const totalLength = sorted.reduce((acc, p) => Math.max(acc, p.position + (p.data?.length ?? p.length ?? 0)), 0);
        const result = new Uint8Array(totalLength);

        for (const part of sorted) {
            if (part.data) {
                result.set(part.data, part.position);
            } else if (part.sourceOffset !== undefined && part.length) {
                result.set(this.buffer.subarray(part.sourceOffset, part.sourceOffset + part.length), part.position);
            }
        }

        return new BufferDataReader(result);
    }
}
