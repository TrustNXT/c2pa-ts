import { HashAlgorithm } from '../crypto';
import * as JUMBF from '../jumbf';

export enum ManifestType {
    Standard,
    Update,
}

// Used only for validation of referenced components
export enum ManifestComponentType {
    Assertion,
}

export interface ManifestComponent {
    label?: string;
    sourceBox?: JUMBF.SuperBox;
    readonly componentType?: ManifestComponentType;
}

export enum ClaimVersion {
    V1,
    V2,
}

export interface HashedURI {
    uri: string;
    hash: Uint8Array;
    algorithm: HashAlgorithm;
}

export interface HashExclusionRange {
    start: number;
    length: number;
    offsetMarker?: boolean;
}

export enum RelationshipType {
    ParentOf = 'parentOf',
    ComponentOf = 'componentOf',
    InputTo = 'inputTo',
}

export enum ValidationStatusCode {
    // Success codes
    ClaimSignatureValidated = 'claimSignature.validated',
    SigningCredentialTrusted = 'signingCredential.trusted',
    SigningCredentialNotRevoked = 'signingCredential.notRevoked',
    TimeStampTrusted = 'timeStamp.trusted',
    AssertionHashedURIMatch = 'assertion.hashedURI.match',
    AssertionDataHashMatch = 'assertion.dataHash.match',
    AssertionBMFFHashMatch = 'assertion.bmffHash.match',
    AssertionBoxesHashMatch = 'assertion.boxesHash.match',
    AssertionCollectionHashMatch = 'assertion.collectionhash.match',
    AssertionAccessible = 'assertion.accessible',
    // Failure codes
    ClaimMissing = 'claim.missing',
    ClaimMultiple = 'claim.multiple',
    ClaimHardBindingsMissing = 'claim.hardBindings.missing',
    ClaimRequiredMissing = 'claim.required.missing',
    ClaimCBORInvalid = 'claim.cbor.invalid',
    IngredientHashedURIMismatch = 'ingredient.hashedURI.mismatch',
    ClaimSignatureMissing = 'claimSignature.missing',
    ClaimSignatureMismatch = 'claimSignature.mismatch',
    ManifestCompressedInvalid = 'manifest.compressed.invalid',
    ManifestInaccessible = 'manifest.inaccessible',
    ManifestMultipleParents = 'manifest.multipleParents',
    ManifestUpdateInvalid = 'manifest.update.invalid',
    ManifestUpdateWrongParents = 'manifest.update.wrongParents',
    SigningCredentialUntrusted = 'signingCredential.untrusted',
    SigningCredentialInvalid = 'signingCredential.invalid',
    SigningCredentialRevoked = 'signingCredential.revoked',
    SigningCredentialExpired = 'signingCredential.expired',
    TimeStampMismatch = 'timeStamp.mismatch',
    TimeStampUntrusted = 'timeStamp.untrusted',
    TimeStampOutsideValidity = 'timeStamp.outsideValidity',
    AssertionHashedURIMismatch = 'assertion.hashedURI.mismatch',
    AssertionMissing = 'assertion.missing',
    AssertionMultipleHardBindings = 'assertion.multipleHardBindings',
    AssertionUndeclared = 'assertion.undeclared',
    AssertionInaccessible = 'assertion.inaccessible',
    AssertionNotRedacted = 'assertion.notRedacted',
    AssertionSelfRedacted = 'assertion.selfRedacted',
    AssertionRequiredMissing = 'assertion.required.missing',
    AssertionJSONInvalid = 'assertion.json.invalid',
    AssertionCBORInvalid = 'assertion.cbor.invalid',
    AssertionActionIngredientMismatch = 'assertion.action.ingredientMismatch',
    AssertionActionRedactionMismatch = 'assertion.action.redactionMismatch',
    AssertionActionRedacted = 'assertion.action.redacted',
    AssertionDataHashMismatch = 'assertion.dataHash.mismatch',
    AssertionBMFFHashMismatch = 'assertion.bmffHash.mismatch',
    AssertionBoxesHashMismatch = 'assertion.boxesHash.mismatch',
    AssertionBoxesHashUnknownBox = 'assertion.boxesHash.unknownBox',
    AssertionCloudDataHardBinding = 'assertion.cloud-data.hardBinding',
    AssertionCloudDataActions = 'assertion.cloud-data.actions',
    AssertionCollectionHashMismatch = 'assertion.collectionHash.mismatch',
    AssertionCollectionHashIncorrectFileCount = 'assertion.collectionHash.incorrectFileCount',
    AssertionCollectionHashInvalidURI = 'assertion.collectionHash.invalidURI',
    AlgorithmUnsupported = 'algorithm.unsupported',
    GeneralError = 'general.error',
}

export interface ValidationStatusEntry {
    code: ValidationStatusCode;
    url?: string;
    explanation?: string;
    success?: boolean;
}

export enum ReviewCode {
    ActionsUnknownActionsPerformed = 'actions.unknownActionsPerformed',
    ActionsMissing = 'actions.missing',
    ActionsPossiblyMissing = 'actions.possiblyMissing',
    DepthMapSceneMismatch = 'depthMap.sceneMismatch',
    IngredientModified = 'ingredient.modified',
    IngredientPossiblyModified = 'ingredient.possiblyModified',
    ThumbnailPrimaryMismatch = 'thumbnail.primaryMismatch',
    StdsIPTCLocationInaccurate = 'stds.iptc.location.inaccurate',
    StdsSchemaOrgCreativeWorkMisattributed = 'stds.schema-org.CreativeWork.misattributed',
    StdsSchemaOrgCreativeWorkMissingAttribution = 'stds.schema-org.CreativeWork.missingAttribution',
}

export enum DataSourceType {
    Signer = 'signer',
    ClaimGeneratorREE = 'claimGenerator.REE',
    ClaimGeneratorTEE = 'claimGenerator.TEE',
    LocalProviderREE = 'localProvider.REE',
    LocalProviderTEE = 'localProvider.TEE',
    RemoteProvider1stParty = 'remoteProvider.1stParty',
    RemoteProvider3rdParty = 'remoteProvider.3rdParty',
    HumanEntry = 'humanEntry',
    HumanEntryAnonymous = 'humanEntry.anonymous',
    HumanEntryIdentified = 'humanEntry.identified',
}

export enum ActionType {
    C2paColorAdjustments = 'c2pa.color_adjustments',
    C2paConverted = 'c2pa.converted',
    C2paCopied = 'c2pa.copied',
    C2paCreated = 'c2pa.created',
    C2paCropped = 'c2pa.cropped',
    C2paDrawing = 'c2pa.drawing',
    C2paEdited = 'c2pa.edited',
    C2paEditedMetadata = 'c2pa.edited.metadata',
    C2paFiltered = 'c2pa.filtered',
    C2paFormatted = 'c2pa.formatted',
    C2paManaged = 'c2pa.managed',
    C2paOpened = 'c2pa.opened',
    C2paOrientation = 'c2pa.orientation',
    C2paProduced = 'c2pa.produced',
    C2paPlaced = 'c2pa.placed',
    C2paPrinted = 'c2pa.printed',
    C2paPublished = 'c2pa.published',
    C2paRedacted = 'c2pa.redacted',
    C2paRemoved = 'c2pa.removed',
    C2paRepackaged = 'c2pa.repackaged',
    C2paResized = 'c2pa.resized',
    C2paSaved = 'c2pa.saved',
    C2paTranscoded = 'c2pa.transcoded',
    C2paWatermarked = 'c2pa.watermarked',
    C2paUnknown = 'c2pa.unknown',
    C2paVersionUpdated = 'c2pa.version_updated',
    FontEdited = 'font.edited',
    FontSubset = 'font.subset',
    FontCreatedFromVariableFont = 'font.createdFromVariableFont',
    FontCharactersAdded = 'font.charactersAdded',
    FontCharactersDeleted = 'font.charactersDeleted',
    FontCharactersModified = 'font.charactersModified',
    FontHinted = 'font.hinted',
    FontOpenTypeFeatureAdded = 'font.openTypeFeatureAdded',
    FontOpenTypeFeatureModified = 'font.openTypeFeatureModified',
    FontOpenTypeFeatureRemoved = 'font.openTypeFeatureRemoved',
    FontMerged = 'font.merged',
}

export enum ActionReason {
    C2paPPIIPresent = 'c2pa.PII.present',
    C2paInvalidData = 'c2pa.invalid.data',
    C2paTradeSecretPresent = 'c2pa.tradesecret.present',
    C2paGovernmentConfidential = 'c2pa.government.confidential',
}

export enum DigitalSourceType {
    DigitalCapture = 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
    NegativeFilm = 'http://cv.iptc.org/newscodes/digitalsourcetype/negativeFilm',
    PositiveFilm = 'http://cv.iptc.org/newscodes/digitalsourcetype/positiveFilm',
    Print = 'http://cv.iptc.org/newscodes/digitalsourcetype/print',
    MinorHumanEdits = 'http://cv.iptc.org/newscodes/digitalsourcetype/minorHumanEdits',
    CompositeCapture = 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeCapture',
    AlgorithmicallyEnhanced = 'http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicallyEnhanced',
    DataDrivenMedia = 'http://cv.iptc.org/newscodes/digitalsourcetype/dataDrivenMedia',
    DigitalArt = 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalArt',
    VirtualRecording = 'http://cv.iptc.org/newscodes/digitalsourcetype/virtualRecording',
    CompositeSynthetic = 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic',
    TrainedAlgorithmicMedia = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
    CompositeWithTrainedAlgorithmicMedia = 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
    AlgorithmicMedia = 'http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia',
    SoftwareImage = 'http://cv.iptc.org/newscodes/digitalsourcetype/softwareImage',
    C2paTrainedAlgorithmicMedia = 'c2pa.trainedAlgorithmicData',
}

export interface Action {
    action: ActionType;
    reason?: ActionReason | string;
    instanceID?: string;
    parameters?: {
        [key: string]: unknown;
        ingredients?: HashedURI[];
        description?: string;
        redacted?: string;
    };
    description?: string;
    digitalSourceType?: DigitalSourceType;
}

export enum MetadataNamespace {
    CameraRaw = 'http://ns.adobe.com/camera-raw-settings/1.0/',
    DublinCore = 'http://purl.org/dc/elements/1.1/',
    Exif = 'http://ns.adobe.com/exif/1.0/',
    ExifEx_1_0 = 'http://cipa.jp/exif/1.0/',
    ExifEx_2_32 = 'http://cipa.jp/exif/2.32/',
    IPTCCore = 'http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/',
    IPTCExtension = 'http://iptc.org/std/Iptc4xmpExt/2008-02-29/',
    PDF = 'http://ns.adobe.com/pdf/1.3/',
    Photoshop = 'http://ns.adobe.com/photoshop/1.0/',
    PLUS = 'http://ns.useplus.org/ldf/xmp/1.0/',
    TIFF = 'http://ns.adobe.com/tiff/1.0/',
    XMPBasic = 'http://ns.adobe.com/xap/1.0/',
    XMPDynamicMedia = 'http://ns.adobe.com/xmp/1.0/DynamicMedia/',
    XMPMediaManagement = 'http://ns.adobe.com/xap/1.0/mm/',
    XMPPagedText = 'http://ns.adobe.com/xap/1.0/t/pg/',
}

export type MetadataValue = string | number | MetadataValue[] | { [key: string]: MetadataValue };

export interface MetadataEntry {
    namespace: MetadataNamespace | string;
    name: string;
    value: MetadataValue;
}
