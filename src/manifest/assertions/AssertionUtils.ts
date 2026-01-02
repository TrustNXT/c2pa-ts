import { Asset } from '../../asset';
import { Crypto, HashAlgorithm } from '../../crypto';
import { HashExclusionRange } from '../types';

export class AssertionUtils {
    private constructor() {}

    public static async hashWithExclusions(
        asset: Asset,
        exclusions: HashExclusionRange[],
        algorithm: HashAlgorithm,
    ): Promise<Uint8Array> {
        if (!exclusions.length) {
            return this.hashRange(asset, 0, asset.getDataLength(), algorithm);
        }

        // Sort exclusions by start position only
        exclusions.sort((a, b) => a.start - b.start);

        const digest = Crypto.streamingDigest(algorithm);
        let currentPosition = 0;
        const CHUNK_SIZE = 1024 * 1024; // 1MB

        const processRange = async (start: number, length: number) => {
            let processed = 0;
            while (processed < length) {
                const readSize = Math.min(length - processed, CHUNK_SIZE);
                const chunk = await asset.getDataRange(start + processed, readSize);
                digest.update(chunk);
                processed += readSize;
            }
        };

        for (const exclusion of exclusions) {
            // Write data up to this position
            if (exclusion.start > currentPosition) {
                await processRange(currentPosition, exclusion.start - currentPosition);
            }

            // Handle offset markers
            if (exclusion.offsetMarker) {
                const offsetBytes = new Uint8Array(8);
                const view = new DataView(offsetBytes.buffer);
                view.setBigInt64(0, BigInt(exclusion.start), false);
                digest.update(offsetBytes);
                currentPosition = exclusion.start; // Don't skip any data for offset markers
            } else {
                currentPosition = exclusion.start + exclusion.length;
            }
        }

        // Hash any remaining data
        if (currentPosition < asset.getDataLength()) {
            await processRange(currentPosition, asset.getDataLength() - currentPosition);
        }

        return digest.final();
    }

    private static async hashRange(
        asset: Asset,
        start: number,
        length: number,
        algorithm: HashAlgorithm,
    ): Promise<Uint8Array> {
        const digest = Crypto.streamingDigest(algorithm);
        const CHUNK_SIZE = 1024 * 1024; // 1MB
        let processed = 0;

        while (processed < length) {
            const readSize = Math.min(length - processed, CHUNK_SIZE);
            const chunk = await asset.getDataRange(start + processed, readSize);
            digest.update(chunk);
            processed += readSize;
        }

        return digest.final();
    }
}
