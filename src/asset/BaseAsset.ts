import { AssetDataReader } from './reader/AssetDataReader';
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

    /**
     * Assembles a data buffer based on a list of parts with an optional source buffer.
     * Each part has a target position and an optional data source. If there should be space left in the resulting
     * buffer for more bytes than the provided data source, or no data source is provided, a length can also
     * be specified.
     */
    protected assembleBuffer(parts: { position: number; data?: Uint8Array; length?: number }[]): Uint8Array {
        const totalLength = parts.reduce(
            (acc, cur) => Math.max(acc, cur.position + (cur.length ?? cur.data?.length ?? 0)),
            0,
        );
        const result = new Uint8Array(totalLength);

        for (const part of parts) {
            if (part.data) {
                result.set(part.data, part.position);
            }
        }
        return result;
    }
}
