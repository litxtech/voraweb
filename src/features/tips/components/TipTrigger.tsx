import { useState } from 'react';
import { Keyboard, type StyleProp, type ViewStyle } from 'react-native';

import type { TipSurface } from '@/features/tips/constants';
import { useTipAllowed } from '@/features/tips/hooks/useTipPreferences';
import { TipButton, type TipButtonVariant } from '@/features/tips/components/TipButton';
import { TipSheet } from '@/features/tips/components/TipSheet';

type TipTriggerProps = {
  recipientId?: string | null;
  recipientName: string;
  surface: TipSurface;
  variant?: TipButtonVariant;
  label?: string;
  contextId?: string | null;
  contextLabel?: string | null;
  returnPath?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Bahşiş butonu + tutar sayfası. Alıcı ilgili bölümde bahşiş almayı kapattıysa
 * veya kullanıcı kendi içeriğine bakıyorsa hiçbir şey render etmez.
 */
export function TipTrigger({
  recipientId,
  recipientName,
  surface,
  variant = 'pill',
  label,
  contextId,
  contextLabel,
  returnPath,
  style,
}: TipTriggerProps) {
  const allowed = useTipAllowed(recipientId, surface);
  const [open, setOpen] = useState(false);

  if (!allowed || !recipientId) return null;

  return (
    <>
      <TipButton
        variant={variant}
        label={label}
        style={style}
        onPress={() => {
          Keyboard.dismiss();
          setOpen(true);
        }}
      />
      {open ? (
        <TipSheet
          visible={open}
          onClose={() => setOpen(false)}
          recipientId={recipientId}
          recipientName={recipientName}
          surface={surface}
          contextId={contextId}
          contextLabel={contextLabel}
          returnPath={returnPath}
        />
      ) : null}
    </>
  );
}
