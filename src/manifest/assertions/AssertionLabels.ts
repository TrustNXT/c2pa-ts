export class AssertionLabels {
    public static readonly dataHash = 'c2pa.hash.data';
    public static readonly boxHash = 'c2pa.hash.boxes';
    public static readonly collectionHash = 'c2pa.hash.collection.data';
    public static readonly bmffHash = 'c2pa.hash.bmff';
    public static readonly bmffV2Hash = 'c2pa.hash.bmff.v2';
    public static readonly hardBindings = [
        AssertionLabels.dataHash,
        AssertionLabels.boxHash,
        AssertionLabels.collectionHash,
        // "A validator or consumer shall not validate content authenticated by a c2pa.hash.bmff assertion. Instead, it shall report the content as unauthenticated, as if no manifest were present."
        //AssertionLabels.bmffHash,
        AssertionLabels.bmffV2Hash,
    ];

    public static readonly ingredient = 'c2pa.ingredient';

    public static readonly actions = 'c2pa.actions';
    public static readonly actionsV2 = 'c2pa.actions.v2';

    public static readonly thumbnailPrefix = 'c2pa.thumbnail.claim.';
    public static readonly ingredientThumbnailPrefix = 'c2pa.thumbnail.ingredient';
}
