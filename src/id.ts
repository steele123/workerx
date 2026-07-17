import { customAlphabet } from 'nanoid';
import { ID_ALPHABET, ID_LENGTH } from './constants';

export const createId = (length = ID_LENGTH) => customAlphabet(ID_ALPHABET, length)();
