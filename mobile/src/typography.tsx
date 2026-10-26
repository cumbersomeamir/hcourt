import { createContext, useContext } from 'react';
import {
  Platform,
  StyleSheet,
  Text as NativeText,
  type TextProps,
} from 'react-native';

const iosFontNames: Record<string, string> = {
  'Arimo-400': 'Arimo-Regular',
  'Arimo-700': 'Arimo-Bold',

  'Cinzel-400': 'Cinzel-Regular',
  'Cinzel-600': 'Cinzel-SemiBold',
  'Cinzel-700': 'Cinzel-Bold',
  'Manrope-400': 'ManropeExtraLight-Regular',
  'Manrope-500': 'ManropeExtraLight-Medium',
  'Manrope-600': 'ManropeExtraLight-SemiBold',
  'Manrope-700': 'ManropeExtraLight-Bold',
};

export const FontContext = createContext<'system' | 'Manrope'>('system');

export function useFont(weight: string | number = '400', family?: string) {
  const inherited = useContext(FontContext);
  const selected = family || inherited;
  if (selected === 'system') {
    const name = `Arimo-${
      weight === 'bold' || Number(weight) >= 600 ? 700 : 400
    }`;
    return Platform.OS === 'ios' ? iosFontNames[name] : name;
  }
  const numeric =
    weight === 'bold' ? 700 : weight === 'normal' ? 400 : Number(weight);
  const resolved =
    numeric >= 700
      ? 700
      : numeric >= 600
      ? 600
      : numeric >= 500 && selected === 'Manrope'
      ? 500
      : 400;
  const name = `${selected}-${resolved}`;
  return Platform.OS === 'ios' ? iosFontNames[name] : name;
}

export function Text({ style, ...props }: TextProps) {
  const flattened = StyleSheet.flatten(style);
  const fontFamily = useFont(flattened?.fontWeight, flattened?.fontFamily);
  return (
    <NativeText
      {...props}
      style={[
        style,
        {
          fontFamily,
          ...(fontFamily === 'sans-serif' &&
          Number(flattened?.fontWeight) >= 600
            ? { fontWeight: '700' as const }
            : {}),
          ...(fontFamily.includes('-') && fontFamily !== 'sans-serif'
            ? { fontWeight: 'normal' as const }
            : {}),
          includeFontPadding: false,
        },
      ]}
    />
  );
}
