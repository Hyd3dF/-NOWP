import { TextStyle } from 'react-native';

export const typography: Record<string, TextStyle> = {
  h1: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '600', lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodySm: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  balance: { fontSize: 36, fontWeight: '700', lineHeight: 44 },
  amount: { fontSize: 24, fontWeight: '600', lineHeight: 32 },
  button: { fontSize: 16, fontWeight: '600', lineHeight: 20 },
  buttonSm: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  tabLabel: { fontSize: 11, fontWeight: '500', lineHeight: 14 },
};
