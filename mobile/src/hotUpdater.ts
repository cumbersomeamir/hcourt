import { HotUpdater } from '@hot-updater/react-native';

export const hotUpdater = HotUpdater.init({
  baseURL: 'https://courtlens.website/updates',
  requestTimeout: 5000,
  onError: () => console.warn('Update check unavailable; continuing with the installed version.'),
});
