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

    getBlob(): Blob | undefined {
        return this.blob;
    }

    assemble(parts: { position: number; data?: Uint8Array; length?: number }[]): AssetDataReader {
        const totalLength = parts.reduce((acc, p) => Math.max(acc, p.position + (p.length ?? p.data?.length ?? 0)), 0);
        const blobParts: BlobPart[] = [];
        let pos = 0;

        parts
            .sort((a, b) => a.position - b.position)
            .forEach(part => {
                if (part.position > pos) blobParts.push(this.blob.slice(pos, part.position));
                blobParts.push(
                    part.data ? (part.data as unknown as BlobPart) : (new Uint8Array(part.length!) as BlobPart),
                );
                pos = part.position + (part.length ?? part.data?.length ?? 0);
            });

        if (pos < totalLength) {
            if (pos < this.blob.size) blobParts.push(this.blob.slice(pos, totalLength));
            // Explicitly fill trailing expansion with zeros
            if (totalLength > Math.max(pos, this.blob.size)) {
                blobParts.push(new Uint8Array(totalLength - Math.max(pos, this.blob.size)) as BlobPart);
            }
        }

        return new BlobDataReader(new Blob(blobParts, { type: this.blob.type }));
    }
}
