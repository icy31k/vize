import React, {
  createContext,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import type {
  TextInputProps,
  ViewStyle,
} from 'react-native';

const light = {
  page: '#f5f4ef',
  card: '#fdfcf8',
  panel: '#ebece2',
  border: '#d9dcd0',
  ink: '#233229',
  muted: '#526158',
  accent: '#285742',
  actionText: '#ffffff',
  accentSoft: '#dae9db',
  darkPanel: '#203b2e',
  inverse: '#f5f8ec',
  inverseMuted: '#becfc0',
  track: '#486453',
  warning: '#993a2b',
  categories: [
    '#7d8070',
    '#447a63',
    '#b26650',
    '#7772a0',
    '#467b9b',
    '#a37237',
  ],
};
const dark = {
  page: '#171c18',
  card: '#202821',
  panel: '#262f26',
  border: '#37453a',
  ink: '#edf1e6',
  muted: '#b1c0b2',
  accent: '#a9d9b7',
  actionText: '#112a1e',
  accentSoft: '#293d30',
  darkPanel: '#233e30',
  inverse: '#f5f8ec',
  inverseMuted: '#becfc0',
  track: '#486453',
  warning: '#ffb5a7',
  categories: [
    '#a5aa94',
    '#82c9a4',
    '#e2987f',
    '#b9aedf',
    '#81b6d1',
    '#d4ae73',
  ],
};

const Theme = createContext(light);
export function Palette({ children }: React.PropsWithChildren) {
  const colors =
    useColorScheme() === 'dark'
      ? dark
      : light;
  return <Theme.Provider
      value={colors}
    >{children}</Theme.Provider>;
}
export const usePalette = () => useContext(Theme);
export const categoryColor = (colors: typeof light, id: number) =>
  colors.categories[(id - 1) % colors.categories.length];

export function Button({
  label,
  onPress,
  kind = 'plain',
  selected,
  expanded,
  disabled,
  a11y,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'plain' | 'primary' | 'inverse' | 'quiet';
  selected?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  a11y?: string;
  style?: ViewStyle;
}) {
  const c = usePalette();
  const filled = kind === 'primary';
  const inverse = kind === 'inverse';
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{
        disabled,
        selected,
        expanded,
      }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: filled
            ? c.accent
            : inverse
            ? c.inverse
            : hovered ||
            selected
            ? c.accentSoft
            : c.card,
          borderColor: focused
            ? c.accent
            : filled ||
            kind === 'quiet'
            ? 'transparent'
            : c.border,
          opacity: disabled
            ? 0.44
            : pressed
            ? 0.78
            : 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          {
            color: filled
              ? c.actionText
              : inverse
              ? '#233229'
              : c.ink,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type TextFieldProps = Pick<
  TextInputProps,
  'accessibilityLabel' | 'value' | 'onChangeText' | 'maxLength' | 'placeholder'
> & {
  style?: ViewStyle;
};

// React Native macOS supports this prop, but the upstream TextInput type omits it.
const macOSTextInputProps = {
  enableFocusRing: false,
};

export function TextField({ style, ...props }: TextFieldProps) {
  const c = usePalette();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessible={false}
      onPress={() => input.current?.focus()}
      style={[
        styles.field,
        {
          backgroundColor: c.card,
          borderColor: focused
            ? c.accent
            : c.border,
        },
        style,
      ]}
    >
      <TextInput
        {...props}
        {...macOSTextInputProps}
        ref={input}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={c.muted}
        style={[
          styles.fieldText,
          {
            color: c.ink,
          },
        ]}
      />
    </Pressable>
  );
}

export function Panel({
  children,
  style,
}: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const c = usePalette();
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: c.card,
          borderColor: c.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Dot({ color, size = 8 }: {
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        borderRadius: size / 2,
      }}
    />
  );
}

export const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  wrap: {
    flexWrap: 'wrap',
  },
  panel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 21,
    minWidth: 0,
  },
  button: {
    minHeight: 34,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  heading: {
    fontSize: 32,
    lineHeight: 39,
    letterSpacing: -1.2,
    fontWeight: '700',
  },
  section: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  small: {
    fontSize: 12,
    lineHeight: 17,
  },
  numbers: {
    fontVariant: [
      'tabular-nums',
    ],
  },
  field: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 7,
    justifyContent: 'center',
  },
  fieldText: {
    fontSize: 13,
    paddingVertical: 0,
    paddingHorizontal: 9,
  },
});
