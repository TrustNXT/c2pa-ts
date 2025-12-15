import { AssetDataReader } from './AssetDataReader';

export class BlobDataReader implements AssetDataReader {
    constructor(private readonly blob: Blob) {}

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

    getSyncData(): Uint8Array {
        throw new Error('Synchronous data access not supported for Blob assets. Use getDataRange() instead.');
    }

    setSyncData(data: Uint8Array): void {
        throw new Error('Cannot set synchronous data on a Blob asset.');
    }
}
