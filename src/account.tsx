import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  tracker,
} from './native';
import type {
  AccountProfile,
} from './accountClient';
import {
  AccountClient,
} from './accountClient';
import {
  Button,
  Panel,
  TextField,
  styles,
  usePalette,
} from './ui';

type Form = 'login' | 'register';
const accountClient = tracker
  ? new AccountClient(tracker)
  : undefined;

export function useAccount() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  const run = useCallback(async (work: () => Promise<void>) => {
    if (pending.current) {
      return false;
    }

    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
      return true;
    } catch (issue) {
      setError(issue instanceof Error
        ? issue.message
        : 'Couldn’t complete the account request.');
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(() => {
    if (!accountClient) {
      return;
    }
    return run(async () => setProfile(await accountClient.status()));
  }, [run]);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  function toggle() {
    if (!open) {
      refresh();
    }
    setOpen(!open);
  }

  function authenticate(email: string, password: string, register: boolean) {
    return run(async () => {
      const signedIn = await accountClient!.authenticate(email, password, register);
      setProfile(signedIn);
    });
  }

  function signOut() {
    return run(async () => {
      await accountClient!.signOut();
      setProfile(null);
    });
  }

  return {
    open,
    profile,
    busy,
    error,
    toggle,
    authenticate,
    signOut,
    clearError: () => setError(''),
  };
}

export function AccountMenu({
  account,
}: {
  account: ReturnType<typeof useAccount>;
}) {
  const palette = usePalette();
  const textStyles = useMemo(() => accountTextStyles(palette), [palette]);
  const [form, setForm] = useState<Form>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const register = form === 'register';
  const canSubmit =
    !account.busy &&
    email.trim().length > 0 &&
    password.length > 0;
  const submitLabel = register
    ? 'Create account'
    : 'Sign in';

  function chooseForm(next?: Form) {
    account.clearError();
    setForm(next);
    setPassword('');
  }

  async function submit() {
    if (!canSubmit) {
      return;
    }

    if (await account.authenticate(email.trim(), password, register)) {
      setForm(undefined);
      setEmail('');
      setPassword('');
    }
  }

  let title = 'Guest mode';
  if (account.profile) {
    title = 'Signed in';
  } else if (form) {
    title = submitLabel;
  }

  let content;
  if (account.profile) {
    content = (
      <>
        <Text
          selectable
          style={textStyles.muted}
        >
          {account.profile.email}
        </Text>
        <Button
          label="Sign out"
          disabled={account.busy}
          onPress={account.signOut}
          style={layout.action}
        />
      </>
    );
  } else if (form) {
    content = (
      <>
        <TextField
          accessibilityLabel="Email"
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          maxLength={254}
          onChangeText={setEmail}
        />
        <TextField
          accessibilityLabel="Password"
          placeholder="Password"
          secureTextEntry
          value={password}
          maxLength={128}
          onChangeText={setPassword}
          onSubmit={submit}
        />
        {register && (
          <Text
            style={[
              styles.small,
              textStyles.muted,
            ]}
          >
            Use at least 12 characters.
          </Text>
        )}
        <View style={layout.actions}>
          <Button
            label={submitLabel}
            kind="primary"
            disabled={!canSubmit}
            onPress={submit}
          />
          <Button
            label="Back"
            kind="quiet"
            disabled={account.busy}
            onPress={() => chooseForm()}
          />
        </View>
      </>
    );
  } else {
    content = (
      <View style={layout.actions}>
        <Button
          label="Sign in"
          kind="primary"
          disabled={account.busy}
          onPress={() => chooseForm('login')}
        />
        <Button
          label="Create account"
          disabled={account.busy}
          onPress={() => chooseForm('register')}
        />
      </View>
    );
  }

  return (
    <Panel style={layout.panel}>
      <View style={styles.between}>
        <Text
          style={[
            styles.section,
            textStyles.heading,
          ]}
        >
          {title}
        </Text>
        <Button
          label="×"
          a11y="Close account menu"
          kind="quiet"
          disabled={account.busy}
          onPress={account.toggle}
        />
      </View>
      {content}
      <Text
        style={[
          styles.small,
          textStyles.muted,
        ]}
      >
        Activity stays on this Mac.
      </Text>
      {account.error !== '' && (
        <Text
          accessibilityRole="alert"
          style={[
            styles.small,
            textStyles.warning,
          ]}
        >
          {account.error}
        </Text>
      )}
    </Panel>
  );
}

function accountTextStyles(palette: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    heading: {
      color: palette.ink,
    },
    muted: {
      color: palette.muted,
    },
    warning: {
      color: palette.warning,
    },
  });
}

const layout = StyleSheet.create({
  panel: {
    gap: 10,
    padding: 14,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  action: {
    alignSelf: 'flex-start',
  },
});
