import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import admin from '../../locales/es/admin.json'
import auth from '../../locales/es/auth.json'
import comun from '../../locales/es/comun.json'
import reportes from '../../locales/es/reportes.json'
import tickets from '../../locales/es/tickets.json'

export const NAMESPACES = ['comun', 'auth', 'tickets', 'reportes', 'admin'] as const

// Español por defecto (RNF-16). Un namespace por feature.
i18n.use(initReactI18next).init({
  resources: {
    es: { comun, auth, tickets, reportes, admin },
  },
  lng: 'es',
  fallbackLng: 'es',
  ns: NAMESPACES,
  defaultNS: 'comun',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
