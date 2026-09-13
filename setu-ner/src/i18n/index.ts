import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en'
import as from './as'
import mani from './mani'
import kha from './kha'
import lus from './lus'

// Language resources. English and Assamese are complete sample translations;
// Manipuri (Meiteilon), Khasi, and Mizo ship key phrases — the architecture
// is designed for a Bhashini (govt multilingual AI) translation plug-in in
// production for full coverage of all five.
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
