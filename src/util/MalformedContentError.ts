/**
 * Denotes that malformed content was encountered during parsing, i.e. not an internal error
 * @category Error
 * @extends {Error}
 */
export class MalformedContentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MalformedContentError';
    }
}
