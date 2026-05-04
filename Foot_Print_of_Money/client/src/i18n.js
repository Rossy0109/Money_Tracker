
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend'; // Import the backend
// import en from './locales/en.json'; // No longer needed due to backend loading
// import bn from './locales/bn.json'; // No longer needed due to backend loading

i18n
  .use(Backend) // Use the backend plugin
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    backend: {
      loadPath: '/locales/{{lng}}.json', // Path where your translation files will be served
    },
    lng: 'en', // default language
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
