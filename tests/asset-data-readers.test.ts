import { describe, expect, it } from 'bun:test';
import { AssemblePart, AssetDataReader } from '../src/asset/reader/AssetDataReader';
import { BlobDataReader } from '../src/asset/reader/BlobDataReader';
import { BufferDataReader } from '../src/asset/reader/BufferDataReader';

const runAssemblyTests = (
    name: string,
    createReader: (data: Uint8Array) => AssetDataReader,
    expectations: {
        ordered: number[];
        reordered: number[];
        gapsAndZeros: number[];
        extended: number[];
    },
) => {
    describe(name, () => {
        const verify = async (parts: AssemblePart[], expected: number[]) => {
            const originalData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            const reader = createReader(originalData);
            const newReader = reader.assemble(parts);
            const blob = await newReader.getBlob();
            const data = blob ? new Uint8Array(await blob.arrayBuffer()) : await newReader.getDataRange();
            expect(Array.from(data)).toEqual(expected);
        };

        it('should assemble parts in order', async () => {
            await verify(
                [
                    { position: 0, data: new Uint8Array([10, 11]) },
                    { position: 9, data: new Uint8Array([99]) },
                ],
                expectations.ordered,
            );
        });

        it('should handle reordering parts', async () => {
            await verify(
                [
                    { position: 5, data: new Uint8Array([0, 1, 2, 3, 4]) },
                    { position: 0, data: new Uint8Array([5, 6, 7, 8, 9]) },
                ],
                expectations.reordered,
            );
        });

        it('should handle implicit gaps and explicit zeroes', async () => {
            await verify(
                [
                    { position: 0, length: 1 }, // Explicit zero
                    { position: 6, length: 1 }, // Explicit zero overrides '6'
                    { position: 10, length: 0 }, // Helper to extend length to 10
                ],
                expectations.gapsAndZeros,
            );
        });

        it('should extend file size', async () => {
            await verify([{ position: 10, data: new Uint8Array([10, 11]) }], expectations.extended);
        });
    });
};

runAssemblyTests(
    'BlobDataReader Assembly (Zeroes Gaps)',
    data => BlobDataReader.fromBlob(new Blob([data as unknown as BlobPart])),
    {
        ordered: [10, 11, 0, 0, 0, 0, 0, 0, 0, 99],
        reordered: [5, 6, 7, 8, 9, 0, 1, 2, 3, 4],
        gapsAndZeros: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        extended: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 11],
    },
);

runAssemblyTests('BufferDataReader Assembly (Zeroes Gaps)', data => new BufferDataReader(data), {
    ordered: [10, 11, 0, 0, 0, 0, 0, 0, 0, 99],
    reordered: [5, 6, 7, 8, 9, 0, 1, 2, 3, 4],
    gapsAndZeros: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    extended: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 11],
});

describe('BlobDataReader Specifics', () => {
    it('should throw an error when parts overlap', async () => {
        const reader = BlobDataReader.fromBlob(new Blob([new Uint8Array(100)]));
        const parts: AssemblePart[] = [
            { position: 0, data: new Uint8Array(50) },
            { position: 10, data: new Uint8Array(20) }, // Overlaps with the previous part (ends at 50)
        ];

        let error: Error | undefined;
        try {
            reader.assemble(parts);
        } catch (e) {
            error = e as Error;
        }

        expect(error).toBeDefined();
        expect(error?.message).toContain('BlobDataReader does not support overlapping parts');
    });
});
