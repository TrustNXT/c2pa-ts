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

        // Sort exclusions by start, however make sure offset markers appear first
        exclusions.sort((a, b) => {
            const startDiff = a.start - b.start;
            if (startDiff !== 0) return startDiff;
            if (a.offsetMarker && !b.offsetMarker) return -1;
            if (!a.offsetMarker && b.offsetMarker) return 1;
            return 0;
        });

        const digest = Crypto.streamingDigest(algorithm);

        for (let i = 0; i < exclusions.length; i++) {
            const previousEnd = i > 0 ? exclusions[i - 1].start + exclusions[i - 1].length : 0;
            const length = exclusions[i].start - previousEnd;

            if (exclusions[i].offsetMarker) {
                const offsetBytes = new Uint8Array(8);
                const view = new DataView(offsetBytes.buffer);
                view.setBigInt64(0, BigInt(exclusions[i].start), false);
                digest.update(offsetBytes);
            }

            if (length > 0) {
                digest.update(await asset.getDataRange(previousEnd, length));
            }
        }

        const endOfLastExclusion = exclusions[exclusions.length - 1].start + exclusions[exclusions.length - 1].length;
        if (asset.getDataLength() > endOfLastExclusion) {
            digest.update(await asset.getDataRange(endOfLastExclusion));
        }

        return digest.final();
    }
}
