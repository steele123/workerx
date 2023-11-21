import { customAlphabet } from 'nanoid'
import { ID_ALPHABET, ID_LENGTH } from './constants'

export const nanoid = customAlphabet(ID_ALPHABET, ID_LENGTH)