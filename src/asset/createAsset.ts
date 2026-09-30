import { BMFF } from './BMFF';
import { JPEG } from './JPEG';
import { MP3 } from './MP3';
import { PNG } from './PNG';
import { Asset, AssetSource, AssetType } from './types';

/**
 * Ordered list of known asset types. Cheap magic-byte checks (JPEG, PNG, MP3)
 * come first; BMFF reads up to 4 KB and is therefore checked last.
 */
const knownAssetTypes: AssetType[] = [JPEG, PNG, MP3, BMFF];

/**
 * Creates an {@link Asset} of the correct type for the given source without
 * requiring the caller to know the file format upfront.
 *
 * Each registered asset type is probed in order via its `canRead()` method.
 * The first matching type is used to construct and return the asset.
 *
 * @param source - A `Uint8Array` or `Blob` containing the asset data.
 * @returns A initialised {@link Asset} of the detected type.
 * @throws {Error} If the source does not match any supported asset type.
 */
export async function createAsset(source: AssetSource): Promise<Asset> {
    for (const assetType of knownAssetTypes) {
        if (await assetType.canRead(source)) {
            return assetType.create(source);
        }
    }
    throw new Error('Unsupported asset type: could not detect a known format from the provided source');
}
