import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from './button';
import { ThemedText } from './themed-text';

// An in-app confirmation dialog. React Native's Alert does nothing on web, and the
// browser's confirm() can't be styled, so the app draws its own.

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const c = useTheme();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal visible={!!options} transparent animationType="fade" onRequestClose={() => close(false)}>
        <Pressable style={styles.backdrop} onPress={() => close(false)} accessibilityLabel="Cancel">
          <Pressable
            style={[styles.dialog, { backgroundColor: c.surface, borderColor: c.border }]}
            accessibilityRole="alert"
            onPress={() => {}}>
            <ThemedText type="heading">{options?.title}</ThemedText>
            {options?.message ? (
              <ThemedText type="small" themeColor="textSecondary">
                {options.message}
              </ThemedText>
            ) : null}
            <View style={styles.actions}>
              <Button label="Cancel" onPress={() => close(false)} compact />
              <Button
                label={options?.confirmLabel ?? 'OK'}
                variant={options?.destructive ? 'danger' : 'primary'}
                onPress={() => close(true)}
                compact
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radius.large,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three - 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
