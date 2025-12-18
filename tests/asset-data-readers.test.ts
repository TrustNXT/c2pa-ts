import { describe, expect, it } from 'bun:test';
import { AssemblePart, AssetDataReader } from '../src/asset/reader/AssetDataReader';
import { BlobDataReader } from '../src/asset/reader/BlobDataReader';
import { BufferDataReader } from '../src/asset/reader/BufferDataReader';

const createVerify =
    (createReader: (data: Uint8Array) => AssetDataReader) => async (parts: AssemblePart[], expected: number[]) => {
        const originalData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        const reader = createReader(originalData);
        const newReader = reader.assemble(parts);
        const data =
            newReader.getBlob() ?
                new Uint8Array(await newReader.getBlob()!.arrayBuffer())
            :   await newReader.getDataRange();
        expect(Array.from(data)).toEqual(expected);
    };

describe('BlobDataReader Assembly (Preserves Gaps)', () => {
    const verify = createVerify(data => new BlobDataReader(new Blob([data as unknown as BlobPart])));

    it('should assemble parts in order', async () => {
        await verify(
            [
                { position: 0, data: new Uint8Array([10, 11]) },
                { position: 9, data: new Uint8Array([99]) },
            ],
            [10, 11, 2, 3, 4, 5, 6, 7, 8, 99],
        );
    });

    it('should handle reordering parts', async () => {
        await verify(
            [
                { position: 5, data: new Uint8Array([0, 1, 2, 3, 4]) },
                { position: 0, data: new Uint8Array([5, 6, 7, 8, 9]) },
            ],
            [5, 6, 7, 8, 9, 0, 1, 2, 3, 4],
        );
    });

    it('should handle implicit gaps (preservation) and explicit zeroes', async () => {
        await verify(
            [
                { position: 0, length: 1 }, // Explicit zero
                { position: 6, length: 1 }, // Explicit zero overrides '6'
                // Index 5 is a gap, should be preserved '5'
                // To verify full length preservation, we must ensure totalLength covers it
                { position: 10, length: 0 }, // Helper to extend length to 10
            ],
            [0, 1, 2, 3, 4, 5, 0, 7, 8, 9],
        );
    });

    it('should extend file size', async () => {
        await verify(
            [
                // Gap 0-10 preserved
                { position: 10, data: new Uint8Array([10, 11]) },
            ],
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        );
    });
});

describe('BufferDataReader Assembly (Zeroes Gaps)', () => {
    const verify = createVerify(data => new BufferDataReader(data));

    it('should assemble parts in order', async () => {
        await verify(
            [
                { position: 0, data: new Uint8Array([10, 11]) },
                { position: 9, data: new Uint8Array([99]) },
            ],
            [10, 11, 0, 0, 0, 0, 0, 0, 0, 99],
        );
    });

    it('should handle reordering parts', async () => {
        await verify(
            [
                { position: 5, data: new Uint8Array([0, 1, 2, 3, 4]) },
                { position: 0, data: new Uint8Array([5, 6, 7, 8, 9]) },
            ],
            [5, 6, 7, 8, 9, 0, 1, 2, 3, 4],
        );
    });

    it('should handle implicit gaps (zeroes) and explicit zeroes', async () => {
        await verify(
            [
                { position: 0, length: 1 },
                { position: 6, length: 1 },
                { position: 10, length: 0 },
            ],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        );
    });

    it('should extend file size', async () => {
        await verify(
            [
                // Gap 0-10 zeroed
                { position: 10, data: new Uint8Array([10, 11]) },
            ],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 11],
        );
    });
});
