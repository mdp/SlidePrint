import en from '../locales/en.json'
import zhCN from '../locales/zh_CN.json'
import de from '../locales/de.json'

type LocaleCode = 'en' | 'zh_CN' | 'de'
const DICTS: Record<LocaleCode, Record<string, string>> = { en, zh_CN: zhCN, de }

let overrideLocale: LocaleCode | null = null

function substitute(msg: string, subs?: Array<string | number>): string {
  if (!subs || subs.length === 0) return msg
  let out = msg
  subs.forEach((v, i) => { out = out.replaceAll(`$${i + 1}`, String(v)) })
  return out
}

export function t(key: string, subs?: Array<string | number>): string {
  try {
    if (overrideLocale) {
      const dict = DICTS[overrideLocale]
      const msg = dict?.[key]
      if (msg) return substitute(msg, subs)
    }
    // @ts-ignore WebExtension API available at runtime
    const fallback = browser?.i18n?.getMessage?.(key, subs?.map(String))
    return fallback || key
  } catch {
    return key
  }
}

export async function initI18n() {
  try {
    // @ts-ignore
    const stored = await browser?.storage?.local?.get('localeOverride')
    const value = stored?.localeOverride as LocaleCode | undefined
    if (value === 'en' || value === 'zh_CN' || value === 'de') overrideLocale = value
    // @ts-ignore
    browser?.storage?.onChanged?.addListener?.((changes: any, area: any) => {
      if (area !== 'local' || !changes?.localeOverride) return
      const next = changes.localeOverride.newValue as LocaleCode | null
      if (next === 'en' || next === 'zh_CN' || next === 'de') overrideLocale = next
      else overrideLocale = null
    })
  } catch {}
}

export async function setLocaleOverride(locale: LocaleCode | null) {
  try {
    overrideLocale = locale ?? null
    // @ts-ignore
    if (locale) await browser?.storage?.local?.set({ localeOverride: locale })
    else await browser?.storage?.local?.remove('localeOverride')
  } catch {}
}

export function useT() { return { t } }
