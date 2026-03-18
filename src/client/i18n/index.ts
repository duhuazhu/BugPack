import { zh } from './zh'
import { en } from './en'

export type Locale = 'zh' | 'en'
export type TranslationKeys = typeof zh

const messages: Record<Locale, TranslationKeys> = { zh, en }

export function getMessages(locale: Locale): TranslationKeys {
  return messages[locale]
}
