import { Platform, ToastAndroid } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

import { isAllowedAppUrl } from './navigation';

const fallbackFilename = 'courtlens-document.pdf';

export async function openBase64File(filename: string, mimeType: string, base64: string) {
  const safeFilename = filename.replace(/[\\/:*?"<>|\r\n]/g, '_') || fallbackFilename;
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${safeFilename}`;
  await ReactNativeBlobUtil.fs.writeFile(path, base64, 'base64');
  if (Platform.OS === 'android') await ReactNativeBlobUtil.android.actionViewIntent(path, mimeType);
  else ReactNativeBlobUtil.ios.previewDocument(path);
}

function filenameFromUrl(value: string) {
  try {
    const file = new URL(value).pathname.split('/').pop();
    return file && /\.[a-z0-9]{1,8}$/i.test(file) ? file : fallbackFilename;
  } catch {
    return fallbackFilename;
  }
}

export async function downloadFile(value: string) {
  if (!isAllowedAppUrl(value)) throw new Error('Blocked download from an unapproved domain.');

  const filename = filenameFromUrl(value);
  const path = Platform.select({
    android: `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${filename}`,
    ios: `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/${filename}`,
  })!;

  const response = await ReactNativeBlobUtil.config({
    fileCache: true,
    path,
    addAndroidDownloads:
      Platform.OS === 'android'
        ? {
            useDownloadManager: true,
            notification: true,
            title: filename,
            description: 'Courtlens document download',
            mime: 'application/pdf',
            mediaScannable: true,
          }
        : undefined,
  }).fetch('GET', value);

  if (Platform.OS === 'ios') ReactNativeBlobUtil.ios.previewDocument(response.path());
}

export async function saveBase64File(filename: string, mimeType: string, base64: string) {
  const safeFilename = filename.replace(/[\\/:*?"<>|\r\n]/g, '_') || fallbackFilename;
  const temporaryPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${Date.now()}-${safeFilename}`;
  await ReactNativeBlobUtil.fs.writeFile(temporaryPath, base64, 'base64');

  if (Platform.OS === 'android') {
    try {
      await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        { name: safeFilename, parentFolder: 'Courtlens', mimeType },
        'Download',
        temporaryPath
      );
      ToastAndroid.show('File saved in Downloads/Courtlens', ToastAndroid.LONG);
    } finally {
      await ReactNativeBlobUtil.fs.unlink(temporaryPath).catch(() => undefined);
    }
    return;
  }

  const destination = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/${Date.now()}-${safeFilename}`;
  await ReactNativeBlobUtil.fs.mv(temporaryPath, destination);
  if (mimeType === 'application/zip') ReactNativeBlobUtil.ios.presentOptionsMenu(destination);
  else ReactNativeBlobUtil.ios.previewDocument(destination);
}
