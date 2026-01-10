/**
 * Represents a media asset file to be used as C2PA input
 */
export interface Asset {
    /**
     * Returns the length of the asset in bytes
     */
    getDataLength(): number;

    /**
     * Returns a slice of the asset data
     * @param start The starting index of the slice (if omitted: get the full asset)
     * @param length The length of the slice (if omitted: until the end of the asset)
     */
    getDataRange(start?: number, length?: number): Promise<Uint8Array>;

    /**
     * Returns the manifest store JUMBF in the asset, if any
     */
    getManifestJUMBF(): Promise<Uint8Array | undefined>;

    /**
     * Returns diagnostic info about the asset structure
     */
    dumpInfo(): string;

    /**
     * The asset's MIME type
     */
    readonly mimeType: string;

    /**
     * Ensures there is enough space in the asset to hold a JUMBF manifest of the given length.
     * Note that this leaves the asset's manifest data in an undefined state and must be followed
     * by a call to `writeManifestJUMBF`.
     * @param length Manifest length in bytes
     */
    ensureManifestSpace(length: number): Promise<void>;

    /**
     * The returned range is for use in hash exclusions. It contains the JUMBF
     * manifest and any required overhead imposed by the image format. For example,
     * the storage can be chunked or the image format can add its own checksum.
     * This is expected to be slightly larger than just the JUMBF!
     */
    getHashExclusionRange(): { start: number; length: number };

    /**
     * Fills in the manifest store JUMBF into the previously created space.
     */
    writeManifestJUMBF(jumbf: Uint8Array): Promise<void>;

    /**
     * Returns the underlying Blob, if available.
     * For streaming readers, this composes all segments into a single Blob using lazy references.
     * NOTE: For writing large files to disk, prefer writeToStream() for chunked streaming I/O.
     */
    getBlob(): Promise<Blob | undefined>;

    /**
     * Writes the asset data to a WHATWG WritableStream.
     * This is the preferred method for large files as it avoids loading everything into memory.
     * @param stream The WritableStream to write to
     */
    writeToStream(stream: WritableStream<Uint8Array>): Promise<void>;
}

export type AssetSource = Uint8Array | Blob;

export interface AssetType {
    create(data: AssetSource): Promise<Asset>;
    canRead(data: AssetSource): Promise<boolean>;
}
