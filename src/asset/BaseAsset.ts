import { AssemblePart, AssetDataReader } from './reader/AssetDataReader';
import { createReader } from './reader/createReader';
import { AssetSource } from './types';

/**
 * Base class for an asset that can be backed by either a Uint8Array (memory) or a Blob (stream/disk).
 */
export abstract class BaseAsset {
    protected reader: AssetDataReader;

    protected constructor(source: AssetSource) {
        this.reader = createReader(source);
    }

    protected get data(): Uint8Array {
        return this.reader.getData();
    }

    protected set data(val: Uint8Array) {
        this.reader.setData(val);
    }

    public getDataLength(): number {
        return this.reader.getDataLength();
    }

    public async getDataRange(start?: number, length?: number): Promise<Uint8Array> {
        return this.reader.getDataRange(start, length);
    }

    public getBlob(): Blob | undefined {
        return this.reader.getBlob();
    }

    /**
     * @see {@link AssetDataReader.assemble}
     */
    protected assembleAsset(parts: AssemblePart[]): void {
        this.reader = this.reader.assemble(parts);
    }
}
