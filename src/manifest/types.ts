import { HashAlgorithm } from '../crypto';
import * as JUMBF from '../jumbf';
import { Claim } from './Claim';

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
    getBytes(claim?: Claim, rebuild?: boolean): Uint8Array | undefined;
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
    ClaimSignatureInsideValidity = 'claimSignature.insideValidity',
    SigningCredentialTrusted = 'signingCredential.trusted',
    SigningCredentialNotRevoked = 'signingCredential.ocsp.notRevoked',
    TimeStampValidated = 'timeStamp.validated',
    TimeStampTrusted = 'timeStamp.trusted',
    AssertionHashedURIMatch = 'assertion.hashedURI.match',
    AssertionDataHashMatch = 'assertion.dataHash.match',
    AssertionBMFFHashMatch = 'assertion.bmffHash.match',
    AssertionBoxesHashMatch = 'assertion.boxesHash.match',
    AssertionCollectionHashMatch = 'assertion.collectionHash.match',
    AssertionAccessible = 'assertion.accessible',
    IngredientManifestValidated = 'ingredient.manifest.validated',
    IngredientClaimSignatureValidated = 'ingredient.claimSignature.validated',

    /** The identity assertion is validated and trusted */
    Trusted = 'cawg.identity.trusted',
    /** The identity assertion is well-formed but not trusted */
    WellFormed = 'cawg.identity.well-formed',

    // Informational codes
    SigningCredentialOCSPSkipped = 'signingCredential.ocsp.skipped',
    SigningCredentialOCSPInaccessible = 'signingCredential.ocsp.inaccessible',
    TimeStampMismatch = 'timeStamp.mismatch',
    TimeStampMalformed = 'timeStamp.malformed',
    TimeStampOutsideValidity = 'timeStamp.outsideValidity',
    TimeStampUntrusted = 'timeStamp.untrusted',
    ManifestUnknownProvenance = 'manifest.unknownProvenance',
    IngredientUnknownProvenance = 'ingredient.unknownProvenance',

    // Failure codes
    ClaimMissing = 'claim.missing',
    ClaimMultiple = 'claim.multiple',
    ClaimHardBindingsMissing = 'claim.hardBindings.missing',
    ClaimCBORInvalid = 'claim.cbor.invalid',
    ClaimSignatureMissing = 'claimSignature.missing',
    ClaimSignatureOutsideValidity = 'claimSignature.outsideValidity',
    ClaimSignatureMismatch = 'claimSignature.mismatch',
    ManifestMultipleParents = 'manifest.multipleParents',
    ManifestTimestampInvalid = 'manifest.timestamp.invalid',
    ManifestTimestampWrongParents = 'manifest.timestamp.wrongParents',
    ManifestUpdateInvalid = 'manifest.update.invalid',
    ManifestUpdateWrongParents = 'manifest.update.wrongParents',
    ManifestInaccessible = 'manifest.inaccessible',
    ManifestCompressedInvalid = 'manifest.compressed.invalid',
    ManifestUnreferenced = 'manifest.unreferenced',
    SigningCredentialUntrusted = 'signingCredential.untrusted',
    SigningCredentialInvalid = 'signingCredential.invalid',
    SigningCredentialExpired = 'signingCredential.expired',
    SigningCredentialOCSPRevoked = 'signingCredential.ocsp.revoked',
    SigningCredentialOCSPUnknown = 'signingCredential.ocsp.unknown',
    AssertionHashedURIMismatch = 'assertion.hashedURI.mismatch',
    AssertionOutsideManifest = 'assertion.outsideManifest',
    AssertionMissing = 'assertion.missing',
    AssertionMultipleHardBindings = 'assertion.multipleHardBindings',
    AssertionUndeclared = 'assertion.undeclared',
    AssertionInaccessible = 'assertion.inaccessible',
    AssertionNotRedacted = 'assertion.notRedacted',
    AssertionSelfRedacted = 'assertion.selfRedacted',
    AssertionJSONInvalid = 'assertion.json.invalid',
    AssertionCBORInvalid = 'assertion.cbor.invalid',
    AssertionActionIngredientMismatch = 'assertion.action.ingredientMismatch',
    AssertionActionMalformed = 'assertion.action.malformed',
    AssertionActionRedacted = 'assertion.action.redacted',
    AssertionActionRedactionMismatch = 'assertion.action.redactionMismatch',
    AssertionDataHashMalformed = 'assertion.dataHash.malformed',
    AssertionDataHashMismatch = 'assertion.dataHash.mismatch',
    AssertionBMFFHashMalformed = 'assertion.bmffHash.malformed',
    AssertionBMFFHashMismatch = 'assertion.bmffHash.mismatch',
    AssertionBoxesHashMismatch = 'assertion.boxesHash.mismatch',
    AssertionBoxesHashUnknownBox = 'assertion.boxesHash.unknownBox',
    AssertionBoxesHashUnknownBoxes = 'assertion.boxesHash.unknownBoxes',
    AssertionCloudDataHardBinding = 'assertion.cloud-data.hardBinding',
    AssertionCloudDataActions = 'assertion.cloud-data.actions',
    AssertionCloudDataMalformed = 'assertion.cloud-data.malformed',
    AssertionCollectionHashMismatch = 'assertion.collectionHash.mismatch',
    AssertionCollectionHashIncorrectFileCount = 'assertion.collectionHash.incorrectFileCount',
    AssertionCollectionHashInvalidURI = 'assertion.collectionHash.invalidURI',
    AssertionCollectionHashMalformed = 'assertion.collectionHash.malformed',
    AssertionIngredientMalformed = 'assertion.ingredient.malformed',
    AssertionMetadataDisallowed = 'assertion.metadata.disallowed',
    IngredientManifestMissing = 'ingredient.manifest.missing',
    IngredientManifestMismatch = 'ingredient.manifest.mismatch',
    IngredientClaimSignatureMissing = 'ingredient.claimSignature.missing',
    IngredientClaimSignatureMismatch = 'ingredient.claimSignature.mismatch',
    AlgorithmUnsupported = 'algorithm.unsupported',
    AlgorithmDeprecated = 'algorithm.deprecated',
    HashedURIMissing = 'hashedURI.missing',
    HashedURIMismatch = 'hashedURI.mismatch',
    GeneralError = 'general.error',

    /**
     * General failure codes for identity assertions
     */
    /** The CBOR of the identity assertion is not valid */
    IdentityCborInvalid = 'cawg.identity.cbor.invalid',
    /** Referenced assertion could not be found in the C2PA claim */
    IdentityAssertionMismatch = 'cawg.identity.assertion.mismatch',
    /** Identity assertion contains duplicate assertion references */
    IdentityAssertionDuplicate = 'cawg.identity.assertion.duplicate',
    /** Identity assertion was signed using a revoked credential */
    IdentityCredentialRevoked = 'cawg.identity.credential_revoked',
    /** Identity assertion does not reference a hard binding assertion */
    IdentityHardBindingMissing = 'cawg.identity.hard_binding_missing',
    /** Identity assertion does not reference the correct hard binding assertion */
    IdentityHardBindingIncorrect = 'cawg.identity.hard_binding_incorrect',
    /** The sig_type is not recognized */
    IdentitySigTypeUnknown = 'cawg.identity.sig_type.unknown',
    /** Pad field contains non-zero bytes */
    IdentityPadInvalid = 'cawg.identity.pad.invalid',
    /** The expected_partial_claim field did not match */
    IdentityExpectedPartialClaimMismatch = 'cawg.identity.expected_partial_claim.mismatch',
    /** The expected_claim_generator field did not match */
    IdentityExpectedClaimGeneratorMismatch = 'cawg.identity.expected_claim_generator.mismatch',
    /** Unexpected identity assertion exists in the manifest */
    IdentityUnexpectedCountersigner = 'cawg.identity.unexpected_countersigner',
    /** Identity assertion has different signing credentials than expected */
    IdentityExpectedCountersignerMismatch = 'cawg.identity.expected_countersigner.mismatch',
    /** Expected identity assertion is missing from the manifest */
    IdentityExpectedCountersignerMissing = 'cawg.identity.expected_countersigner.missing',

    /**
     * Identity Claims Aggregation (ICA) specific status codes
     */
    /** The ICA credential has passed all validation requirements */
    IcaCredentialValid = 'cawg.ica.credential_valid',
    /** The signature could not be parsed as valid COSE_Sign1 */
    IcaInvalidCoseSign1 = 'cawg.ica.invalid_cose_sign1',
    /** The alg header is missing or unsupported */
    IcaInvalidAlg = 'cawg.ica.invalid_alg',
    /** The content type header is missing or incorrect */
    IcaInvalidContentType = 'cawg.ica.invalid_content_type',
    /** The payload is not a valid Verifiable Credential */
    IcaInvalidVerifiableCredential = 'cawg.ica.invalid_verifiable_credential',
    /** The issuer field is not a DID */
    IcaInvalidIssuer = 'cawg.ica.invalid_issuer',
    /** The issuer DID uses an unsupported method */
    IcaDidUnsupportedMethod = 'cawg.ica.did_unsupported_method',
    /** Unable to resolve the DID document */
    IcaDidUnavailable = 'cawg.ica.did_unavailable',
    /** DID document could not be parsed */
    IcaInvalidDidDocument = 'cawg.ica.invalid_did_document',
    /** DID is from an untrusted source */
    IcaUntrustedIssuer = 'cawg.ica.untrusted_issuer',
    /** Signature is not valid */
    IcaSignatureMismatch = 'cawg.ica.signature_mismatch',
    /** Valid RFC 3161 timestamp found */
    IcaTimeStampValidated = 'cawg.ica.time_stamp.validated',
    /** Invalid RFC 3161 timestamp found */
    IcaTimeStampInvalid = 'cawg.ica.time_stamp.invalid',
    /** Missing issuanceDate or validFrom field */
    IcaValidFromMissing = 'cawg.ica.valid_from.missing',
    /** Invalid issuanceDate or validFrom value */
    IcaValidFromInvalid = 'cawg.ica.valid_from.invalid',
    /** Invalid expirationDate or validUntil value */
    IcaValidUntilInvalid = 'cawg.ica.valid_until.invalid',
    /** Unsupported revocation method */
    IcaRevocationUnsupported = 'cawg.ica.revocation.unsupported',
    /** Revocation status unavailable */
    IcaRevocationUnavailable = 'cawg.ica.revocation.unavailable',
    /** Credential verified as not revoked */
    IcaCredentialNotRevoked = 'cawg.ica.credential.not_revoked',
    /** Credential was found to be revoked */
    IcaCredentialRevoked = 'cawg.ica.credential.revoked',
    /** c2paAsset field does not match signer_payload */
    IcaSignerPayloadMismatch = 'cawg.ica.signer_payload.mismatch',
    /** verifiedIdentities field is missing */
    IcaVerifiedIdentitiesMissing = 'cawg.ica.verified_identities.missing',
    /** One or more verifiedIdentities entries is invalid */
    IcaVerifiedIdentitiesInvalid = 'cawg.ica.verified_identities.invalid',
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

    // the following three values of review-code are deprecated as of 2.0
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

    // the following two values of source-type are deprecated as of 2.0
    HumanEntryAnonymous = 'humanEntry.anonymous',
    HumanEntryIdentified = 'humanEntry.identified',
}

export enum ActionType {
    // C2PA actions
    C2paAdjustedColor = 'c2pa.adjustedColor',
    C2paChangedSpeed = 'c2pa.changedSpeed',
    C2paColorAdjustments = 'c2pa.color_adjustments',
    C2paConverted = 'c2pa.converted',
    C2paCopied = 'c2pa.copied',
    C2paCreated = 'c2pa.created',
    C2paCropped = 'c2pa.cropped',
    C2paDeleted = 'c2pa.deleted',
    C2paDrawing = 'c2pa.drawing',
    C2paDubbed = 'c2pa.dubbed',
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
    C2paTranslated = 'c2pa.translated',
    C2paTrimmed = 'c2pa.trimmed',
    C2paUnknown = 'c2pa.unknown',
    C2paVersionUpdated = 'c2pa.version_updated',
    C2paWatermarked = 'c2pa.watermarked',

    // Font actions
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
    softwareAgent?: {
        name: string;
        version?: string;
        icon?: HashedURI;
        operatingSystem?: string;
    };
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

export enum ThumbnailType {
    Claim,
    Ingredient,
}

export enum TrainingAndDataMiningChoice {
    Allowed = 'allowed',
    NotAllowed = 'notAllowed',
    Constrained = 'constrained',
}

export interface TrainingAndDataMiningEntry {
    choice: TrainingAndDataMiningChoice;
    constraintInfo?: string;
}

export enum TrainingAndDataMiningKey {
    DataMining = 'c2pa.data_mining',
    AIInference = 'c2pa.ai_inference',
    AIGenerativeTraining = 'c2pa.ai_generative_training',
    AITraining = 'c2pa.ai_training',
}

export enum CAWGTrainingAndDataMiningKey {
    DataMining = 'cawg.data_mining',
    AIInference = 'cawg.ai_inference',
    AIGenerativeTraining = 'cawg.ai_generative_training',
    AITraining = 'cawg.ai_training',
}

export const C2PA_URN_PREFIX_V2 = 'urn:c2pa:';
export const C2PA_URN_PREFIX_V1 = 'urn:uuid:';
