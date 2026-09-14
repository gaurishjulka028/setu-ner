import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en'
import as from './as'
import mani from './mani'
import kha from './kha'
import lus from './lus'

// English, Assamese, and the supported Meiteilon (Manipuri) authentication
// flow have local strings so the login/registration journey does not fall back
// to English. Other regional languages retain their existing rollout status.
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    as: { translation: as },
    mani: { translation: mani },
    kha: { translation: kha },
    lus: { translation: lus },
  },
  lng: localStorage.getItem('setu-lang') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => localStorage.setItem('setu-lang', lng))

export default i18n
