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
            return Crypto.digest(await asset.getDataRange(), algorithm);
        }

        // Sort exclusions by start position only
        exclusions.sort((a, b) => a.start - b.start);

        const digest = Crypto.streamingDigest(algorithm);
        let currentPosition = 0;

        for (const exclusion of exclusions) {
            // Write data up to this position
            if (exclusion.start > currentPosition) {
                digest.update(await asset.getDataRange(currentPosition, exclusion.start - currentPosition));
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
            digest.update(await asset.getDataRange(currentPosition));
        }

        return digest.final();
    }
}
