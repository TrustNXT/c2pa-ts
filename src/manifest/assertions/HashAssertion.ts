import { Asset } from '../../asset';
import { HashAlgorithm } from '../../crypto';

/**
 * Interface for assertions that provide hash-based validation of assets
 */
export interface HashAssertion {
    /**
     * The hash algorithm used by this assertion
     */
    algorithm?: HashAlgorithm;

    /**
     * The computed hash value
     */
    hash?: Uint8Array;

    /**
     * Updates the assertion with hash and exclusion data from the given asset
     * @param asset - The asset to generate the hash from
     */
    updateWithAsset(asset: Asset): Promise<void>;
}
