import * as JUMBF from '../jumbf';
import { MalformedContentError } from '../util';
import * as raw from './rawTypes';
import { ValidationStatusCode, ValidationStatusEntry } from './types';
import { ValidationError } from './ValidationError';

/**
 * Represents a manifest validation result in accordance with the C2PA specification
 */
export class ValidationResult {
    /**
     * All status entries
     */
    public readonly statusEntries: ValidationStatusEntry[] = [];

    /**
     * Whether the manifest is valid, i.e. no error entries are present
     */
    public isValid = true;

    private add(code: ValidationStatusCode, uri?: JUMBF.IBox | string, explanation?: string) {
        this.statusEntries.push({
            code,
            url: typeof uri === 'string' ? uri : this.getURIFromBox(uri),
            explanation,
        });
    }

    private getURIFromBox(box?: JUMBF.IBox): string | undefined {
        if (box && box instanceof JUMBF.SuperBox) return box.uri;
        return undefined;
    }

    /**
     * Adds an informational (= success) message to the result
     * @param code Status code as defined by C2PA specification
     * @param uri Optional URI string or JUMBF box object that the status applies to
     * @param explanation Optional further human-readable explanation of the status
     */
    public addInformational(code: ValidationStatusCode, uri?: JUMBF.IBox | string, explanation?: string) {
        this.add(code, uri, explanation);
    }

    /**
     * Utility method to create a new ValidationResult with a single success message
     * @param code Status code as defined by C2PA specification
     * @param uri Optional URI string or JUMBF box object that the status applies to
     * @param explanation Optional further human-readable explanation of the status
     */
    public static success(code: ValidationStatusCode, uri?: JUMBF.IBox | string, explanation?: string) {
        const result = new ValidationResult();
        result.addInformational(code, uri, explanation);
        return result;
    }

    /**
     * Adds a negative validation message to the result
     * @param code Status code as defined by C2PA specification
     * @param uri Optional URI string or JUMBF box object that the problem applies to
     * @param explanation Optional further human-readable explanation of the status
     */
    public addError(code: ValidationStatusCode, uri?: JUMBF.IBox | string, explanation?: string) {
        this.add(code, uri, explanation);
        this.isValid = false;
    }

    /**
     * Utility method to create a new ValidationResult with a single error message
     * @param code Status code as defined by C2PA specification
     * @param uri Optional URI string or JUMBF box object that the problem applies to
     * @param explanation Optional further human-readable explanation of the status
     */
    public static error(code: ValidationStatusCode, uri?: JUMBF.IBox | string, explanation?: string) {
        const result = new ValidationResult();
        result.addError(code, uri, explanation);
        return result;
    }

    /**
     * Maps a thrown exception to a matching validation error
     * @param e ValidationError, MalformedContentError, or generic Error
     * @param uri Optional URI string or JUMBF box object that the problem applies to
     */
    public handleError(e: Error, uri?: JUMBF.IBox | string) {
        if (e instanceof ValidationError) {
            this.add(e.code, e.uri ?? uri, e.message);
        } else if (e instanceof MalformedContentError) {
            this.add(ValidationStatusCode.GeneralError, uri, e.message);
        } else {
            this.add(ValidationStatusCode.GeneralError, uri, `Internal error (${e.name})`);
        }
        this.isValid = false;
    }

    /**
     * Utility method to create a new ValidationResult based on a thrown exception
     * @param e ValidationError, MalformedContentError, or generic Error
     * @param uri Optional URI string or JUMBF box object that the problem applies to
     */
    public static fromError(e: Error, uri?: JUMBF.IBox | string) {
        const result = new ValidationResult();
        result.handleError(e, uri);
        return result;
    }

    /**
     * Returns the validation result as a list of status-map entries
     */
    public toRepresentation(): raw.StatusMap[] {
        return this.statusEntries as raw.StatusMap[];
    }

    /**
     * Merges the status entries of another ValidationResult into this one
     * @param others One or more ValidationResult objects to merge
     */
    public merge(...others: ValidationResult[]): void {
        for (const other of others) {
            this.statusEntries.push(...other.statusEntries);
            this.isValid = this.isValid && other.isValid;
        }
    }
}
