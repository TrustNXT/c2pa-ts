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
}
