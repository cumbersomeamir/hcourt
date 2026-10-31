import { Alert } from 'react-native';

export function confirmAiSharing(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      'Share data with AI?',
      'To answer this request, Courtlens sends your message, relevant conversation history, lawyer profile and case details to Microsoft Azure AI (OpenAI models). Do not include confidential information without permission. AI answers may be inaccurate; verify them against official records. Cancel to continue without sending this request.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Agree and send', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
