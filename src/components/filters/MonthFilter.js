// src/components/filters/MonthFilter.js
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Modal, Portal, RadioButton, Text, useTheme } from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';

// modes: 'all' | 'current' | 'previous' | 'custom'
export function formatFilterLabel({ mode, year, month }) {
  if (mode === 'all') return 'All time';
  if (mode === 'current') {
    const now = new Date();
    return now.toLocaleString('en', { month: 'short', year: 'numeric' });
  }
  if (mode === 'previous') {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString('en', { month: 'short', year: 'numeric' });
  }
  if (mode === 'custom' && year && month) {
    return new Date(year, month - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' });
  }
  return '';
}

export default function MonthFilter({
  expenses,
  value,
  onChange,
  buttonLabel = 'Filter',
}) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const [localMode, setLocalMode] = useState(value?.mode ?? 'current');
  const [localYear, setLocalYear] = useState(value?.year ?? new Date().getFullYear());
  const [localMonth, setLocalMonth] = useState(value?.month ?? (new Date().getMonth() + 1));

  const { minMonthDate, maxMonthDate } = useMemo(() => {
    const now = new Date();
    const max = new Date(now.getFullYear(), now.getMonth(), 1);
    if (!Array.isArray(expenses) || expenses.length === 0) {
      return { minMonthDate: undefined, maxMonthDate: max };
    }
    let min = null;
    for (const e of expenses) {
      const ts = e?.createdAt;
      const dt = ts?.toDate ? ts.toDate() : (ts?.seconds ? new Date(ts.seconds * 1000) : null);
      if (dt) min = min ? (dt < min ? dt : min) : dt;
    }
    const minStart = min ? new Date(min.getFullYear(), min.getMonth(), 1) : undefined;
    return { minMonthDate: minStart, maxMonthDate: max };
  }, [expenses]);

  const open = () => {
    setLocalMode(value?.mode ?? 'current');
    setLocalYear(value?.year ?? new Date().getFullYear());
    setLocalMonth(value?.month ?? (new Date().getMonth() + 1));
    setVisible(true);
  };

  const apply = () => {
    setVisible(false);
    onChange?.({ mode: localMode, year: localYear, month: localMonth });
  };

  return (
    <>
      <Button mode="text" onPress={open}>{buttonLabel}</Button>

      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={{ backgroundColor: theme.colors.surface, margin: 20, padding: 20, borderRadius: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: theme.colors.text }}>Filter Expenses</Text>
          <RadioButton.Group onValueChange={(v) => setLocalMode(v)} value={localMode}>
            <RadioButton.Item label="All time" value="all" />
            <RadioButton.Item label="Current month" value="current" />
            <RadioButton.Item label="Previous month" value="previous" />
            <RadioButton.Item label="Custom month" value="custom" />
          </RadioButton.Group>

          {localMode === 'custom' && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.outline, borderRadius: 8 }}>
                <Picker selectedValue={localYear} onValueChange={(val) => setLocalYear(val)} style={{ height: 180 }}>
                  {(function () {
                    const years = [];
                    const minY = minMonthDate ? minMonthDate.getFullYear() : localYear - 10;
                    const maxY = maxMonthDate ? maxMonthDate.getFullYear() : localYear + 1;
                    for (let y = maxY; y >= minY; y--) years.push(y);
                    return years.map((y) => <Picker.Item key={y} label={`${y}`} value={y} />);
                  })()}
                </Picker>
              </View>
              <View style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.outline, borderRadius: 8 }}>
                <Picker selectedValue={localMonth} onValueChange={(val) => setLocalMonth(val)} style={{ height: 180 }}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const thisDate = new Date(localYear, m - 1, 1);
                    const disabled = (minMonthDate && thisDate < minMonthDate) || (maxMonthDate && thisDate > maxMonthDate);
                    return (
                      <Picker.Item
                        key={m}
                        label={new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' })}
                        value={m}
                        color={disabled ? theme.colors.disabled : theme.colors.text}
                        enabled={!disabled}
                      />
                    );
                  })}
                </Picker>
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button onPress={() => setVisible(false)} style={{ marginRight: 8 }}>Cancel</Button>
            <Button mode="contained" onPress={apply}>Apply</Button>
          </View>
        </Modal>
      </Portal>
    </>
  );
}