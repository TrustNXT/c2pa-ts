import { describe, expect, it } from 'bun:test';
import { AssetDataReader } from '../src/asset/reader/AssetDataReader';
import { BlobDataReader } from '../src/asset/reader/BlobDataReader';
import { BufferDataReader } from '../src/asset/reader/BufferDataReader';

const runConformanceTests = (name: string, createReader: (data: Uint8Array) => AssetDataReader) => {
    describe(`${name} Assembly`, () => {
        const originalData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        const reader = createReader(originalData);

        const verify = async (r: AssetDataReader, expected: number[]) => {
            const data = r.getBlob() ? new Uint8Array(await r.getBlob()!.arrayBuffer()) : await r.getDataRange();
            expect(Array.from(data)).toEqual(expected);
        };

        it('should assemble parts in order', async () => {
            const newReader = reader.assemble([
                { position: 0, data: new Uint8Array([10, 11]) },
                { position: 9, data: new Uint8Array([99]) },
            ]);
            await verify(newReader, [10, 11, 2, 3, 4, 5, 6, 7, 8, 99]);
        });

        it('should handle reordering parts', async () => {
            const newReader = reader.assemble([
                { position: 5, data: new Uint8Array([0, 1, 2, 3, 4]) },
                { position: 0, data: new Uint8Array([5, 6, 7, 8, 9]) },
            ]);
            await verify(newReader, [5, 6, 7, 8, 9, 0, 1, 2, 3, 4]);
        });

        it('should handle implicit gaps (preservation) and explicit zeroes', async () => {
            const newReader = reader.assemble([
                { position: 0, length: 1 }, // Explicit zero
                { position: 6, length: 1 }, // Explicit zero overrides '6'
                // Index 5 is a gap, should be preserved '5'
                // To verify full length preservation, we must ensure totalLength covers it
                { position: 10, length: 0 }, // Helper to extend length to 10
            ]);
            await verify(newReader, [0, 1, 2, 3, 4, 5, 0, 7, 8, 9]);
        });

        it('should extend file size', async () => {
            const newReader = reader.assemble([
                // Gap 0-10 preserved
                { position: 10, data: new Uint8Array([10, 11]) },
            ]);
            await verify(newReader, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        });
    });
};

runConformanceTests('BlobDataReader', data => new BlobDataReader(new Blob([data as unknown as BlobPart])));
runConformanceTests('BufferDataReader', data => new BufferDataReader(data));
