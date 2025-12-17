import { AssetDataReader } from './AssetDataReader';

export class BlobDataReader implements AssetDataReader {
    private _buffer?: Uint8Array;

    constructor(private readonly blob: Blob) {}

    async load(): Promise<void> {
        this._buffer ??= new Uint8Array(await this.blob.arrayBuffer());
    }

    getDataLength(): number {
        return this.blob.size;
    }

    async getDataRange(start?: number, length?: number): Promise<Uint8Array> {
        if (start === undefined && length === undefined) {
            return new Uint8Array(await this.blob.arrayBuffer());
        }

        const effectiveStart = start ?? 0;
        const effectiveEnd = length === undefined ? this.blob.size : effectiveStart + length;

        return new Uint8Array(await this.blob.slice(effectiveStart, effectiveEnd).arrayBuffer());
    }

    getData(): Uint8Array {
        if (!this._buffer) throw new Error('Call load() first');
        return this._buffer;
    }

    setData(data: Uint8Array): void {
        this._buffer = data;
    }
}
