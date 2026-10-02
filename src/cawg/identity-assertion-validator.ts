/**
 * CAWG Identity Assertion Validation
 * Functions for validating identity assertions according to CAWG specification v1.2
 *
 * @module cawg/validator
 */

import * as JUMBF from '../jumbf';
import {
    Assertion,
    CawgTrustConfiguration,
    Claim,
    Manifest,
    ValidationResult,
    ValidationStatusCode,
} from '../manifest';
import { IdentityAssertion } from '../manifest/assertions/IdentityAssertion';
import { ExpectedCountersignerMap, HashedUriMap, HashMap, SignatureType, SignerPayloadMap } from './types';
import {
    arrayEquals,
    computeHash,
    deepEqual,
    extractAssertionLabel,
    findDuplicateReferences,
    hashMapsEqual,
    isEmptyOrMissing,
    isHardBindingAssertion,
    serializeClaimData,
    validatePadding,
} from './utils';

export class IdentityAssertionValidator {
    manifest: Manifest;
    assertion: IdentityAssertion;
    assertionLabel: string;
    sourceBox: JUMBF.SuperBox;
    options: CawgTrustConfiguration;
    result: ValidationResult;

    constructor(
        manifest: Manifest,
        assertion: IdentityAssertion,
        assertionLabel: string,
        sourceBox: JUMBF.SuperBox,
        options: CawgTrustConfiguration = {},
    ) {
        this.manifest = manifest;
        this.assertion = assertion;
        this.assertionLabel = assertionLabel;
        this.sourceBox = sourceBox;
        this.options = options;

        this.result = new ValidationResult();
    }

    /**
     * Validate an identity assertion
     *
     * Performs comprehensive validation according to CAWG specification Section 7
     *
     * @returns Validation result with status codes
     */
    async validateIdentityAssertion(): Promise<ValidationResult> {
        // Step 1: Verify hard binding assertion is included and correct
        await this.validateHardBindingReference(this.assertion.signerPayload.referenced_assertions);

        // Step 2: Validate required fields
        if (
            !this.assertion.signerPayload ||
            isEmptyOrMissing(this.assertion.signature) ||
            isEmptyOrMissing(this.assertion.pad1)
        ) {
            this.result.addError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'Identity assertion missing required fields',
            );
        }

        // Step 3: Validate padding contains only zeros
        if (!validatePadding(this.assertion.pad1)) {
            this.result.addError(
                ValidationStatusCode.IdentityPadInvalid,
                this.sourceBox,
                'pad1 field contains non-zero bytes',
            );
        }

        if (this.assertion.pad2 && !validatePadding(this.assertion.pad2)) {
            this.result.addError(
                ValidationStatusCode.IdentityPadInvalid,
                this.sourceBox,
                'pad2 field contains non-zero bytes',
            );
        }

        // Step 4: Validate signer_payload structure
        const payload = this.assertion.signerPayload;

        if (!payload.referenced_assertions || payload.referenced_assertions.length === 0) {
            this.result.addError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'signer_payload missing referenced_assertions',
            );
            return this.result;
        }

        if (!payload.sig_type || !Object.values(SignatureType).includes(payload.sig_type)) {
            this.result.addError(
                ValidationStatusCode.IdentitySigTypeUnknown,
                this.sourceBox,
                'signer_payload missing or unknown sig_type',
            );
            return this.result;
        }

        // Step 5: Check for duplicate references
        const duplicates = findDuplicateReferences(payload.referenced_assertions);
        if (duplicates.length > 0) {
            this.result.addError(
                ValidationStatusCode.IdentityAssertionDuplicate,
                this.sourceBox,
                `Found ${duplicates.length} duplicate assertion reference(s)`,
            );
        }

        // Step 6: Verify referenced assertions exist in claim
        await this.validateReferencedAssertions(payload.referenced_assertions);

        // Step 7: Validate expected_partial_claim if present
        if (payload.expected_partial_claim) {
            await this.validateExpectedPartialClaim(payload);
        }

        // Step 8: Validate expected_claim_generator if present
        if (payload.expected_claim_generator) {
            await this.validateExpectedClaimGenerator(payload.expected_claim_generator);
        }

        // Step 9: Validate expected_countersigners if present
        if (payload.expected_countersigners) {
            await this.validateExpectedCountersigners(payload.expected_countersigners);
        }

        // Step 10: Validate signature based on sig_type
        // This is delegated to credential-type-specific validators
        if (this.result.isValid) {
            // If no failures so far, consider it well-formed at minimum
            this.result.addInformational(
                ValidationStatusCode.WellFormed,
                this.sourceBox,
                'Identity assertion is well-formed',
            );
        }

        return this.result;
    }

    /**
     * Validate that all referenced assertions exist in the claim
     */
    async validateReferencedAssertions(references: HashedUriMap[]): Promise<void> {
        for (const ref of references) {
            const claimAssertion = this.manifest.claim?.assertions?.find(assertion => assertion.uri === ref.url);

            if (!claimAssertion) {
                this.result.addError(
                    ValidationStatusCode.IdentityAssertionMismatch,
                    this.sourceBox,
                    `Referenced assertion not found in claim: ${ref.url}`,
                );
                continue;
            }

            if (!hashMapsEqual({ hash: ref.hash, alg: '' }, { hash: claimAssertion.hash, alg: '' })) {
                this.result.addError(
                    ValidationStatusCode.IdentityAssertionMismatch,
                    this.sourceBox,
                    `Referenced assertion hash does not match claim entry: ${ref.url}`,
                );
                continue;
            }

            const found = this.manifest.assertions?.getAssertionsByLabel(extractAssertionLabel(ref.url) ?? '');

            if (!found || found.length === 0) {
                this.result.addError(
                    ValidationStatusCode.IdentityAssertionMismatch,
                    this.sourceBox,
                    `Referenced assertion object not found for claim entry: ${ref.url}`,
                );
            }
        }
    }

    /**
     * Validate hard binding assertion reference
     */
    async validateHardBindingReference(references: HashedUriMap[]): Promise<void> {
        // Find hard binding assertions in references
        const hardBindingRefs = references.filter(ref => {
            const label = extractAssertionLabel(ref.url);
            return label && isHardBindingAssertion(label);
        });

        if (hardBindingRefs.length === 0) {
            this.result.addError(
                ValidationStatusCode.IdentityHardBindingMissing,
                this.sourceBox,
                'No hard binding assertion referenced',
            );
        }

        // Verify it's the correct hard binding for this manifest
        // The correct one is determined by the algorithm described in
        // C2PA spec Section 15.12
        const expectedHardBindings = this.manifest.claim?.assertions?.filter(
            assertion => assertion.uri && isHardBindingAssertion(extractAssertionLabel(assertion.uri) ?? ''),
        );

        if (!expectedHardBindings || expectedHardBindings.length === 0) {
            // No hard binding found in claim
            this.result.addError(
                ValidationStatusCode.IdentityHardBindingMissing,
                this.sourceBox,
                'No hard binding assertion found in claim',
            );
            return;
        }
        const correctRef = hardBindingRefs.find(ref => {
            const expectedHardBinding = expectedHardBindings.find(binding => binding.uri === ref.url);
            return (
                expectedHardBinding &&
                hashMapsEqual(
                    { hash: ref.hash, alg: '' },
                    {
                        hash: expectedHardBinding.hash,
                        alg: '',
                    },
                )
            );
        });

        if (hardBindingRefs.length > 0 && !correctRef) {
            this.result.addError(
                ValidationStatusCode.IdentityHardBindingIncorrect,
                this.sourceBox,
                'Hard binding reference does not match the active manifest binding',
            );
        }

        return;
    }

    /**
     * Validate expected_partial_claim field
     */
    async validateExpectedPartialClaim(payload: SignerPayloadMap): Promise<ValidationResult> {
        if (!payload.expected_partial_claim) return this.result;

        try {
            // Clone claim and replace hashes with zeros as specified
            const modifiedClaim = structuredClone(this.manifest.claim)!;

            // Replace current identity assertion hash with zeros
            this.replaceAssertionHash(modifiedClaim, this.assertionLabel);

            // Replace expected countersigners' hashes with zeros
            if (payload.expected_countersigners) {
                // TODO Implementation depends on matching credentials
            }

            // Serialize and hash
            const serialized = serializeClaimData(modifiedClaim);
            const computed = await computeHash(serialized, payload.expected_partial_claim.alg);

            const expected = payload.expected_partial_claim.hash;
            if (!arrayEquals(computed, expected)) {
                this.result.addError(
                    ValidationStatusCode.IdentityExpectedPartialClaimMismatch,
                    this.sourceBox,
                    'expected_partial_claim does not match computed value',
                );
            }
        } catch (error) {
            this.result.addError(
                ValidationStatusCode.IdentityExpectedPartialClaimMismatch,
                this.sourceBox,
                `Error validating expected_partial_claim: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        return this.result;
    }

    /**
     * Validate expected_claim_generator field
     */
    async validateExpectedClaimGenerator(expected: HashMap): Promise<void> {
        try {
            // Extract end-entity certificate DER bytes from the manifest claim signature
            const certRawData = this.manifest.signature?.signatureData?.certificate?.rawData;
            if (!certRawData) {
                this.result.addError(
                    ValidationStatusCode.IdentityExpectedClaimGeneratorMismatch,
                    this.sourceBox,
                    'Could not extract claim generator certificate from claim signature',
                );
                return;
            }
            const certificate = new Uint8Array(certRawData);

            // Compute hash of certificate
            const computed = await computeHash(certificate, expected.alg);

            if (!arrayEquals(computed, expected.hash)) {
                this.result.addError(
                    ValidationStatusCode.IdentityExpectedClaimGeneratorMismatch,
                    this.sourceBox,
                    'expected_claim_generator does not match computed hash of claim generator certificate',
                );
            }
        } catch (error) {
            this.result.addError(
                ValidationStatusCode.IdentityExpectedClaimGeneratorMismatch,
                this.sourceBox,
                `Error validating expected_claim_generator: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Validate expected_countersigners field
     */
    async validateExpectedCountersigners(expectedCountersigners: ExpectedCountersignerMap[]): Promise<void> {
        // Find all other identity assertions in the manifest
        let otherIdentityAssertions = this.manifest?.assertions?.getIdentityAssertions() ?? [];
        otherIdentityAssertions = otherIdentityAssertions.filter(a => a !== this.assertion); // Exclude the current assertion being validated

        for (const otherAssertion of otherIdentityAssertions) {
            // Remove expected_countersigners field from the signer_payload
            const partialPayload = { ...otherAssertion.signerPayload };
            delete partialPayload.expected_countersigners;

            // Find matching entry in expected_countersigners
            const matchingEntry = expectedCountersigners.find(ec =>
                deepEqual(ec.partial_signer_payload, partialPayload),
            );

            if (!matchingEntry) {
                this.result.addError(
                    ValidationStatusCode.IdentityUnexpectedCountersigner,
                    this.sourceBox,
                    `Found identity assertion not described in expected_countersigners`,
                );
                continue;
            }

            // If expected_credentials is present, validate it
            if (matchingEntry.expected_credentials) {
                // TODO
                const credentialMatch = await this.validateCountersignerCredentials(
                    otherAssertion,
                    matchingEntry.expected_credentials,
                );

                if (!credentialMatch) {
                    this.result.addError(
                        ValidationStatusCode.IdentityExpectedCountersignerMismatch,
                        this.sourceBox,
                        'Countersigner credentials do not match expected value',
                    );
                }
            }
        }

        // Check if any expected countersigners are missing
        if (otherIdentityAssertions.length < expectedCountersigners.length) {
            this.result.addError(
                ValidationStatusCode.IdentityExpectedCountersignerMissing,
                this.sourceBox,
                'Expected identity assertion is missing from manifest',
            );
        }
        return; // Mocked for now until implementation is complete
    }

    /**
     * Helper: Replace assertion hash with zeros in claim
     */
    replaceAssertionHash(claimData: Claim, label: string): void {
        const assertions = claimData.assertions ?? [];

        for (const assertion of assertions) {
            const assertionLabel = extractAssertionLabel(assertion.uri);
            if (assertionLabel === label) {
                assertion.hash = new Uint8Array(assertion.hash.length);
            }
        }
    }

    /**
     * Helper: Validate countersigner credentials
     */
    async validateCountersignerCredentials(assertion: Assertion, expectedCredentials: HashMap): Promise<boolean> {
        // TODO Extract and hash credentials from assertion
        return true;
    }

    /**
     * Check if an identity assertion is well-formed (basic structure validation)
     * This is a quick check before full validation
     */
    isWellFormedIdentityAssertion(assertion: IdentityAssertion): boolean {
        try {
            return !!(
                assertion.signerPayload &&
                assertion.signature &&
                assertion.pad1 &&
                assertion.signerPayload.referenced_assertions &&
                assertion.signerPayload.sig_type
            );
        } catch {
            return false;
        }
    }
}
