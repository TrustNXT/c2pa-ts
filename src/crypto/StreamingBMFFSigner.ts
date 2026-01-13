import { Crypto } from './Crypto';
import { HashAlgorithm, StreamingDigest } from './types';

/**
 * Default chunk size for Merkle tree leaves (1MB).
 * This is the recommended size for balancing memory usage and verification granularity.
 */
export const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB

/**
 * Result of finalizing a streaming signer session.
 */
export interface StreamingSignerResult {
    /** Unique identifier for this track/stream */
    uniqueId: number;
    /** Local identifier for this track/stream */
    localId: number;
    /** Number of chunks/leaves in the tree */
    count: number;
    /** Hash algorithm used */
    alg?: string;
    /** Hash of initialization segment (for fMP4) */
    initHash?: Uint8Array;
    /** All leaf hashes for storage in manifest */
    hashes: Uint8Array[];
    /** Fixed block size used (if applicable) */
    fixedBlockSize?: number;
    /** Variable block sizes used (if applicable) */
    variableBlockSizes?: number[];
}

/**
 * Options for creating a StreamingBMFFSigner.
 */
export interface StreamingSignerOptions {
    /** Hash algorithm to use (default: SHA-256) */
    algorithm?: HashAlgorithm;
    /** Fixed chunk size in bytes (default: 1MB) */
    chunkSize?: number;
    /** Use variable chunk sizes instead of fixed */
    variableChunkSizes?: boolean;
    /** Unique ID for this track/stream */
    uniqueId?: number;
    /** Local ID for this track/stream */
    localId?: number;
}

/**
 * A streaming signer for BMFF/MP4 files that enables signing video content
 * while it's being recorded or streamed.
 *
 * This class implements incremental Merkle tree construction, allowing you to:
 * 1. Hash data chunks as they arrive (during capture)
 * 2. Build the Merkle tree after all data is received
 * 3. Generate the hash assertion for the C2PA manifest
 *
 * This is particularly useful for:
 * - Live video capture where data arrives in real-time
 * - Large files where loading everything into memory is impractical
 * - Fragmented MP4 (fMP4) streams
 *
 * @example
 * ```typescript
 * // During video capture
 * const signer = new StreamingBMFFSigner({ algorithm: 'SHA-256' });
 *
 * // Process chunks as they arrive from the capture API
 * camera.onChunk(chunk => {
 *   await signer.processChunk(chunk);
 * });
 *
 * // When recording ends
 * const merkleData = await signer.finalize();
 * // Use merkleData to create BMFFHashAssertion
 * ```
 */
export class StreamingBMFFSigner {
    private readonly algorithm: HashAlgorithm;
    private readonly chunkSize: number;
    private readonly variableChunkSizes: boolean;
    private readonly uniqueId: number;
    private readonly localId: number;

    private readonly leafHashes: Uint8Array[] = [];
    private readonly blockSizes: number[] = [];

    private buffer: Uint8Array = new Uint8Array(0);
    private totalBytesProcessed = 0;
    private isFinalized = false;

    private initSegmentHash?: Uint8Array;
    private initDigest?: StreamingDigest;
    private isCapturingInit = false;

    constructor(options: StreamingSignerOptions = {}) {
        this.algorithm = options.algorithm ?? 'SHA-256';
        this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
        this.variableChunkSizes = options.variableChunkSizes ?? false;
        this.uniqueId = options.uniqueId ?? 0;
        this.localId = options.localId ?? 0;
    }

    /**
     * Starts capturing the initialization segment (for fMP4).
     * Call this before processing any init segment data.
     * The init segment hash is stored separately in the MerkleMap.
     */
    public startInitSegment(): void {
        if (this.isFinalized) {
            throw new Error('Signer is already finalized');
        }
        this.initDigest = Crypto.streamingDigest(this.algorithm);
        this.isCapturingInit = true;
    }

    /**
     * Ends the initialization segment capture.
     * Call this when the init segment is complete (before mdat data).
     */
    public async endInitSegment(): Promise<void> {
        if (!this.isCapturingInit || !this.initDigest) {
            throw new Error('Not capturing init segment');
        }
        this.initSegmentHash = await this.initDigest.final();
        this.isCapturingInit = false;
        this.initDigest = undefined;
    }

    /**
     * Processes a chunk of data from the video stream.
     *
     * For fixed chunk sizes:
     * - Data is buffered until a full chunk is available
     * - The chunk is then hashed and added to the Merkle tree
     *
     * For variable chunk sizes:
     * - Each call to processChunk creates a new leaf
     * - The actual size is recorded for the variableBlockSizes field
     *
     * @param data The raw data chunk from the capture API
     */
    public async processChunk(data: Uint8Array): Promise<void> {
        if (this.isFinalized) {
            throw new Error('Signer is already finalized');
        }

        // If capturing init segment, update that digest
        if (this.isCapturingInit && this.initDigest) {
            this.initDigest.update(data);
            return;
        }

        if (this.variableChunkSizes) {
            // Variable mode: each chunk is a separate leaf
            await this.addLeafFromData(data);
            this.blockSizes.push(data.length);
        } else {
            // Fixed mode: buffer data and emit full chunks
            this.buffer = this.appendToBuffer(this.buffer, data);

            while (this.buffer.length >= this.chunkSize) {
                const chunk = this.buffer.subarray(0, this.chunkSize);
                await this.addLeafFromData(chunk);
                this.buffer = this.buffer.subarray(this.chunkSize);
            }
        }

        this.totalBytesProcessed += data.length;
    }

    /**
     * Processes raw mdat content by reading it in chunks.
     * This is a convenience method for processing an entire mdat box.
     *
     * @param mdatContent The entire mdat payload
     */
    public async processMdatContent(mdatContent: Uint8Array): Promise<void> {
        if (this.variableChunkSizes) {
            // In variable mode, treat the entire content as one chunk
            await this.processChunk(mdatContent);
        } else {
            // In fixed mode, split into chunks
            let offset = 0;
            while (offset < mdatContent.length) {
                const end = Math.min(offset + this.chunkSize, mdatContent.length);
                await this.processChunk(mdatContent.subarray(offset, end));
                offset = end;
            }
        }
    }

    /**
     * Finalizes the streaming session and returns the Merkle data.
     * This should be called when recording/streaming is complete.
     *
     * Any remaining buffered data is processed as a final (potentially smaller) chunk.
     *
     * @returns The MerkleMap-compatible result for storage in the manifest
     */
    public async finalize(): Promise<StreamingSignerResult> {
        if (this.isFinalized) {
            throw new Error('Signer is already finalized');
        }

        // Process any remaining buffered data
        if (this.buffer.length > 0) {
            await this.addLeafFromData(this.buffer);
            if (!this.variableChunkSizes) {
                // For fixed size, the last chunk may be smaller
                // We still report the fixed size in the manifest
            }
            this.buffer = new Uint8Array(0);
        }

        this.isFinalized = true;

        const result: StreamingSignerResult = {
            uniqueId: this.uniqueId,
            localId: this.localId,
            count: this.leafHashes.length,
            hashes: this.leafHashes,
        };

        // Add algorithm if not SHA-256 (default)
        if (this.algorithm !== 'SHA-256') {
            result.alg = this.algorithm.toLowerCase().replace('-', '');
        }

        // Add init hash if present
        if (this.initSegmentHash) {
            result.initHash = this.initSegmentHash;
        }

        // Add block size info
        if (this.variableChunkSizes) {
            result.variableBlockSizes = this.blockSizes;
        } else {
            result.fixedBlockSize = this.chunkSize;
        }

        return result;
    }

    /**
     * Returns the current number of chunks processed.
     */
    public getChunkCount(): number {
        return this.leafHashes.length;
    }

    /**
     * Returns the total bytes processed so far.
     */
    public getTotalBytesProcessed(): number {
        return this.totalBytesProcessed;
    }

    /**
     * Returns the hash algorithm being used.
     */
    public getAlgorithm(): HashAlgorithm {
        return this.algorithm;
    }

    /**
     * Resets the signer for reuse.
     */
    public reset(): void {
        this.leafHashes.length = 0;
        this.blockSizes.length = 0;
        this.buffer = new Uint8Array(0);
        this.totalBytesProcessed = 0;
        this.isFinalized = false;
        this.initSegmentHash = undefined;
        this.initDigest = undefined;
        this.isCapturingInit = false;
    }

    /**
     * Adds a leaf hash from raw data.
     */
    private async addLeafFromData(data: Uint8Array): Promise<void> {
        const hash = await Crypto.digest(data, this.algorithm);
        this.leafHashes.push(hash);
    }

    /**
     * Appends data to a buffer, creating a new buffer.
     */
    private appendToBuffer(existing: Uint8Array, newData: Uint8Array): Uint8Array {
        const result = new Uint8Array(existing.length + newData.length);
        result.set(existing, 0);
        result.set(newData, existing.length);
        return result;
    }
}
