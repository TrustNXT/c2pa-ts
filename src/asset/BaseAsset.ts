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

    public getDataLength(): number {
        return this.reader.getDataLength();
    }

    public async getDataRange(start?: number, length?: number): Promise<Uint8Array> {
        return this.reader.getDataRange(start, length);
    }

    /**
     * Returns the underlying Blob, if available.
     * For BlobDataReader, this composes all segments into a single Blob using lazy references.
     * NOTE: For writing large files to disk, prefer writeToStream() for chunked streaming I/O.
     */
    public async getBlob(): Promise<Blob | undefined> {
        return this.reader.getBlob();
    }

    /**
     * Writes the asset data to a WHATWG WritableStream.
     * This is the preferred method for large files as it avoids loading everything into memory.
     */
    public async writeToStream(stream: WritableStream<Uint8Array>): Promise<void> {
        return this.reader.writeToStream(stream);
    }

    /**
     * Replaces a range of bytes at the given position with new data.
     * Works for both buffer and streaming blob modes.
     */
    protected replaceRange(position: number, data: Uint8Array): void {
        this.reader.replaceRange(position, data);
    }

    /**
     * Creates a part that references a range from the original source.
     * Works uniformly for both buffer and blob modes.
     */
    protected sourceRef(position: number, sourceOffset: number, length: number): AssemblePart {
        return { position, sourceOffset, length };
    }

    /**
     * @see {@link AssetDataReader.assemble}
     */
    protected assembleAsset(parts: AssemblePart[]): void {
        this.reader = this.reader.assemble(parts);
    }
}
