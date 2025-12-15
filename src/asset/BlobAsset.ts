/**
 * An asset backed by a Blob.
 * Used for large files to avoid loading the entire content into memory.
 */
export abstract class BlobAsset {
    public readonly mimeType: string;

    constructor(protected blob: Blob) {
        this.mimeType = blob.type;
    }

    public getDataLength(): number {
        return this.blob.size;
    }

    public async getDataRange(start?: number, length?: number): Promise<Uint8Array> {
        if (start === undefined && length === undefined) {
            return new Uint8Array(await this.blob.arrayBuffer());
        }

        const effectiveStart = start ?? 0;
        const effectiveEnd = length !== undefined ? effectiveStart + length : this.blob.size;

        // Blob.slice end is exclusive, like Array.slice
        return new Uint8Array(await this.blob.slice(effectiveStart, effectiveEnd).arrayBuffer());
    }

    public dumpInfo(): string {
        return `BlobAsset: ${this.mimeType}, size: ${this.blob.size}`;
    }
}
