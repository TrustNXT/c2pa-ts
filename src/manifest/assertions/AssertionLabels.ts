export class AssertionLabels {
    public static readonly dataHash = 'c2pa.hash.data';
    public static readonly boxHash = 'c2pa.hash.boxes';
    public static readonly collectionHash = 'c2pa.hash.collection.data';
    public static readonly bmffHash = 'c2pa.hash.bmff';
    public static readonly bmffV2Hash = 'c2pa.hash.bmff.v2';
    public static readonly bmffV3Hash = 'c2pa.hash.bmff.v3';
    public static readonly hardBindings = [
        AssertionLabels.dataHash,
        AssertionLabels.boxHash,
        AssertionLabels.collectionHash,
        // "A validator or consumer shall not validate content authenticated by a c2pa.hash.bmff assertion. Instead, it shall report the content as unauthenticated, as if no manifest were present."
        //AssertionLabels.bmffHash,
        AssertionLabels.bmffV2Hash,
        AssertionLabels.bmffV3Hash,
    ];

    public static readonly ingredient = 'c2pa.ingredient';
    public static readonly ingredientV2 = 'c2pa.ingredient.v2';
    public static readonly ingredientV3 = 'c2pa.ingredient.v3';

    public static readonly actions = 'c2pa.actions';
    public static readonly actionsV2 = 'c2pa.actions.v2';

    /** Generic JSON-LD based metadata assertion (C2PA 2.0) */
    public static readonly metadata = 'c2pa.metadata';
    /** CAWG JSON-LD based metadata assertion */
    public static readonly cawgMetadata = 'cawg.metadata';
    /** Common metadata assertion (deprecated as of C2PA 2.0) */
    public static readonly commonMetadata = 'stds.metadata';
    /** EXIF metadata assertion (deprecated as of C2PA 1.4) */
    public static readonly exifMetadata = 'stds.exif';
    /** IPTC metadata assertion (deprecated as of C2PA 1.3) */
    public static readonly iptcMetadata = 'stds.iptc';
    /** IPTC photo metadata assertion (deprecated as of C2PA 1.2) */
    public static readonly iptcPhotoMetadata = 'stds.iptc.photo-metadata';
    /** All JSON-LD based metadata assertions */
    public static readonly metadataAssertions = [
        AssertionLabels.metadata,
        AssertionLabels.cawgMetadata,
        AssertionLabels.commonMetadata,
        AssertionLabels.exifMetadata,
        AssertionLabels.iptcMetadata,
        AssertionLabels.iptcPhotoMetadata,
    ];

    /** Schema.org based Creative Work assertion (deprecated as of C2PA 2.0) */
    public static readonly creativeWork = 'stds.schema-org.CreativeWork';

    /** Training and Data Mining assertion (deprecated as of C2PA 2.0) */
    public static readonly trainingAndDataMining = 'c2pa.training-mining';
    /** CAWG Training and Data Mining assertion */
    public static readonly cawgTrainingAndDataMining = 'cawg.training-mining';

    /** CAWG Identity assertion */
    public static readonly identity = 'cawg.identity';

    public static readonly thumbnailPrefix = 'c2pa.thumbnail.claim.';
    public static readonly ingredientThumbnailPrefix = 'c2pa.thumbnail.ingredient';
}
