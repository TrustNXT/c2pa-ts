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
    getManifestJUMBF(): Uint8Array | undefined;

    /**
     * Returns diagnostic info about the asset structure
     */
    dumpInfo(): string;
}
