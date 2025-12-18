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
            const data =
                newReader.getBlob() ?
                    new Uint8Array(await newReader.getBlob()!.arrayBuffer())
                :   await newReader.getDataRange();
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
    'BlobDataReader Assembly (Preserves Gaps)',
    data => new BlobDataReader(new Blob([data as unknown as BlobPart])),
    {
        ordered: [10, 11, 2, 3, 4, 5, 6, 7, 8, 99],
        reordered: [5, 6, 7, 8, 9, 0, 1, 2, 3, 4],
        gapsAndZeros: [0, 1, 2, 3, 4, 5, 0, 7, 8, 9],
        extended: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    },
);

runAssemblyTests('BufferDataReader Assembly (Zeroes Gaps)', data => new BufferDataReader(data), {
    ordered: [10, 11, 0, 0, 0, 0, 0, 0, 0, 99],
    reordered: [5, 6, 7, 8, 9, 0, 1, 2, 3, 4],
    gapsAndZeros: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    extended: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 11],
});
