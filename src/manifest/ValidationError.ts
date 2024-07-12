import * as JUMBF from '../jumbf';
import { ValidationStatusCode } from './types';

/**
 * Utility error that maps to a C2PA specified validation result
 * @class ValidationError
 * @extends {Error}
 */
export class ValidationError extends Error {
    constructor(
        public readonly code: ValidationStatusCode,
        public readonly uri?: JUMBF.IBox | string,
        public readonly explanation?: string,
    ) {
        super(explanation);
        this.name = 'ValidationError';
    }
}
