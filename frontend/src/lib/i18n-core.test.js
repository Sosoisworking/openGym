import { describe, it, expect } from 'vitest'
import {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES, DERIVED_LOCALES,
  baseLang, derivePack, dateLocale, getLang, t, _setLangState, exerciseNameClass, exerciseNameFor, CASED_NAME_LANGS
} from './i18n-core.js'
import { EXDB } from './exercises-data.js'

describe('baseLang', () => {

  it('leaves every other language as itself', () => {
    expect(baseLang('de')).toBe('de')
    expect(baseLang('pt-BR')).toBe('pt-BR')
    expect(baseLang('en')).toBe('en')
    expect(baseLang('nonsense')).toBe('nonsense')
  })

  it('keeps derived locales in step with their base for instructions and names', () => {
    // The membership tests run on the base, so de-CH gains instruction and exercise-name packs
    // exactly when de does — there is no second list entry to remember.
    expect(INSTR_LANGS.includes(baseLang('de-CH'))).toBe(INSTR_LANGS.includes('de'))
    expect(EXERCISE_NAME_LANGS.includes(baseLang('de-CH'))).toBe(EXERCISE_NAME_LANGS.includes('de'))
  })
})

describe('derivePack', () => {



  it('returns the pack untouched for a language that is not derived', () => {
    const pack = { a: 'Gesäß' }
    expect(derivePack('de', pack)).toBe(pack)
    expect(derivePack('en', pack)).toBe(pack)
  })


})


// EXDB stores English names lower-case and the UI title-cases them with CSS. German brings its
// own casing, and applying capitalize on top of it produced "Bankdrücken Mit Langhantel". The
// other packs are stored lower-case like EXDB, and without the class they read all lower-case.

// #290 took the title-casing off every translated name so German would keep its own, and the
// packs stored lower-case (pt-BR, hu, es, ru, it, fr) went lower-case everywhere with it. Which
// packs carry real casing is a list, so it is checked against what the packs actually hold: a
// new pack that is lower-case gets the casing without anyone remembering to add it, and one with
// real casing fails here until it is listed.

// The two per-language switches in Settings (the English name in parentheses, English names
// only) came with the Italian and French packs, but they have to hold for every pack the app
// ships — German too, which covers only part of the catalogue.
