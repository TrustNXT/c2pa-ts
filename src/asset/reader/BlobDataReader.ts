import { AssemblePart, AssetDataReader } from './AssetDataReader';

/** A segment: either a lazy blob slice or an eager buffer for new/modified data */
type Segment = { start: number; length: number } & (
    | { type: 'slice'; blob: Blob; blobStart: number }
    | { type: 'data'; data: Uint8Array }
);

/**
 * Streaming blob reader - never loads entire file into memory.
 * Uses lazy blob slices for original data and eager buffers only for modifications.
 */
export class BlobDataReader implements AssetDataReader {
    private segments: Segment[];
    private readonly _totalLength: number;
    private readonly sourceBlob: Blob;

    private constructor(segments: Segment[], totalLength: number, sourceBlob: Blob) {
        this.segments = segments;
        this._totalLength = totalLength;
        this.sourceBlob = sourceBlob;
    }

    static fromBlob(blob: Blob): BlobDataReader {
        return new BlobDataReader(
            [{ type: 'slice', start: 0, length: blob.size, blob, blobStart: 0 }],
            blob.size,
            blob,
        );
    }

    private static fromSegments(segments: Segment[], totalLength: number, sourceBlob: Blob): BlobDataReader {
        return new BlobDataReader(segments, totalLength, sourceBlob);
    }

    getDataLength(): number {
        return this._totalLength;
    }

    async getDataRange(start?: number, length?: number): Promise<Uint8Array> {
        const effectiveStart = start ?? 0;
        const effectiveEnd = Math.min(
            this._totalLength,
            length === undefined ? this._totalLength : effectiveStart + length,
        );
        const result = new Uint8Array(effectiveEnd - effectiveStart);
        let resultOffset = 0;

        for (const seg of this.segments) {
            const segEnd = seg.start + seg.length;
            if (segEnd <= effectiveStart || seg.start >= effectiveEnd) continue;

            const overlapStart = Math.max(seg.start, effectiveStart);
            const overlapEnd = Math.min(segEnd, effectiveEnd);
            const overlapLength = overlapEnd - overlapStart;
            const segOffset = overlapStart - seg.start;

            if (seg.type === 'data') {
                result.set(seg.data.subarray(segOffset, segOffset + overlapLength), resultOffset);
            } else {
                const slice = seg.blob.slice(seg.blobStart + segOffset, seg.blobStart + segOffset + overlapLength);
                result.set(new Uint8Array(await slice.arrayBuffer()), resultOffset);
            }
            resultOffset += overlapLength;
        }
        return result;
    }

    getBlob(): Promise<Blob> {
        const parts: BlobPart[] = this.segments.map(seg =>
            seg.type === 'data' ? (seg.data as BlobPart) : seg.blob.slice(seg.blobStart, seg.blobStart + seg.length),
        );
        return Promise.resolve(new Blob(parts));
    }

    /**
     * Writes segments to a WHATWG WritableStream.
     * Streams data in chunks to avoid loading the entire file into memory.
     */
    async writeToStream(stream: WritableStream<Uint8Array>): Promise<void> {
        const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB chunks
        const writer = stream.getWriter();

        try {
            for (const seg of this.segments) {
                if (seg.type === 'data') {
                    await writer.write(seg.data);
                } else {
                    // Stream blob slice in chunks to avoid memory issues
                    let offset = 0;
                    while (offset < seg.length) {
                        const chunkSize = Math.min(CHUNK_SIZE, seg.length - offset);
                        const slice = seg.blob.slice(seg.blobStart + offset, seg.blobStart + offset + chunkSize);
                        const chunk = new Uint8Array(await slice.arrayBuffer());
                        await writer.write(chunk);
                        offset += chunkSize;
                    }
                }
            }
        } finally {
            await writer.close();
        }
    }

    /**
     * Creates a segment that represents a slice of the original segment.
     */
    private sliceSegment(seg: Segment, start: number, length: number): Segment {
        const offset = start - seg.start;
        if (seg.type === 'slice') {
            return { type: 'slice', start, length, blob: seg.blob, blobStart: seg.blobStart + offset };
        }
        return { type: 'data', start, length, data: seg.data.subarray(offset, offset + length) };
    }

    /**
     * Replaces a range of bytes at the given position with new data.
     * Updates segments efficiently without loading the entire blob.
     */
    replaceRange(position: number, data: Uint8Array): void {
        const end = position + data.length;
        const newSegments: Segment[] = [];

        for (const seg of this.segments) {
            const segEnd = seg.start + seg.length;

            // Segment doesn't overlap with replacement range
            if (segEnd <= position || seg.start >= end) {
                newSegments.push(seg);
                continue;
            }

            // Keep part before replacement
            if (seg.start < position) {
                newSegments.push(this.sliceSegment(seg, seg.start, position - seg.start));
            }

            // Keep part after replacement
            if (segEnd > end) {
                newSegments.push(this.sliceSegment(seg, end, segEnd - end));
            }
        }

        // Insert replacement and sort
        newSegments.push({ type: 'data', start: position, length: data.length, data });
        newSegments.sort((a, b) => a.start - b.start);
        this.segments = newSegments;
    }

    assemble(parts: AssemblePart[]): AssetDataReader {
        const sorted = [...parts].sort((a, b) => a.position - b.position);
        const totalLength = sorted.reduce((acc, p) => Math.max(acc, p.position + (p.data?.length ?? p.length ?? 0)), 0);
        const newSegments: Segment[] = [];
        let pos = 0;

        for (const part of sorted) {
            if (part.position < pos) throw new Error('BlobDataReader does not support overlapping parts');

            // Fill gap with zeros
            if (part.position > pos) {
                newSegments.push({
                    type: 'data',
                    start: pos,
                    length: part.position - pos,
                    data: new Uint8Array(part.position - pos),
                });
            }

            // Determine the actual size this part occupies
            const effectiveLength = part.length ?? part.data?.length ?? 0;

            if (part.data) {
                // Explicit data provided
                if (part.length && part.length > part.data.length) {
                    // Data is shorter than reserved length - need to zero-fill
                    const paddedData = new Uint8Array(part.length);
                    paddedData.set(part.data);
                    newSegments.push({ type: 'data', start: part.position, length: part.length, data: paddedData });
                } else {
                    // Data fills the entire space
                    newSegments.push({ type: 'data', start: part.position, length: part.data.length, data: part.data });
                }
            } else if (part.sourceOffset !== undefined && part.length) {
                // Lazy reference to original source blob
                newSegments.push({
                    type: 'slice',
                    start: part.position,
                    length: part.length,
                    blob: this.sourceBlob,
                    blobStart: part.sourceOffset,
                });
            } else if (part.length) {
                // Reserve empty space
                newSegments.push({
                    type: 'data',
                    start: part.position,
                    length: part.length,
                    data: new Uint8Array(part.length),
                });
            }
            pos = part.position + effectiveLength;
        }

        return BlobDataReader.fromSegments(newSegments, totalLength, this.sourceBlob);
    }
}
