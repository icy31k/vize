import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  tracker,
  trackerEvents,
} from './src/native';
import {
  countdown,
  dateLabel,
  dayRange,
  dayStart,
  duration,
  overlap,
  shiftDay,
  summarize,
  unix,
  weekStart,
} from './src/tracker';
import type {
  Activity,
  Category,
  History,
  Range,
  Status,
  TimerStatus,
} from './src/tracker';
import {
  Button,
  Dot,
  Palette,
  Panel,
  TextField,
  categoryColor,
  styles,
  usePalette,
} from './src/ui';

const tabs = ['Focus Desk', 'Activity Journal', 'Weekly Review'] as const;
type Tab = (typeof tabs)[number];
type Action = (task: () => Promise<void>) => Promise<boolean>;
const emptyHistory: History = { categories: [], activities: [], completed: 0 };
const emptyTimer: TimerStatus = {
  phase: 'focus',
  deadline: null,
  remaining: 1500,
  focusMinutes: 25,
  breakMinutes: 5,
  hasStarted: false,
};
const fullDate = (date: Date) =>
  dateLabel(date, { weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = (date: Date) =>
  dateLabel(date, { month: 'short', day: 'numeric' });
const timeLabel = (seconds: number) =>
  dateLabel(new Date(seconds * 1000), { hour: 'numeric', minute: '2-digit' });
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : String(error);

export default function App() {
  return (
    <Palette>
      <Desktop />
    </Palette>
  );
}

function Desktop() {
  const c = usePalette();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('Focus Desk');
  const [today, setToday] = useState(() => dayStart(new Date()));
  const [journalDay, setJournalDay] = useState(() => dayStart(new Date()));
  const [reportDay, setReportDay] = useState(() => dayStart(new Date()));
  const [mode, setMode] = useState<'day' | 'week'>('week');
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState<string>();
  const [history, setHistory] = useState<{
    key: string;
    value: History;
  }>();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [invalidated, invalidate] = useState(0);
  const lastStatus = useRef<Status | undefined>(undefined);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const day =
    tab === 'Focus Desk'
      ? today
      : tab === 'Activity Journal'
      ? journalDay
      : reportDay;
  const start =
    tab === 'Weekly Review' &&
    mode === 'week'
      ? weekStart(day)
      : day;
  const dayCount =
    tab === 'Weekly Review' &&
    mode === 'week'
      ? 7
      : 1;
  const from = unix(start);
  const to = unix(shiftDay(start, dayCount));
  const key = `${from}/${to}`;
  const data =
    history?.key === key
      ? history.value
      : emptyHistory;
  const timer = status?.timer ?? emptyTimer;
  const narrow = width < 880;

  useEffect(() => {
    mounted.current = true;
    const update = (next: Status) => {
      if (!mounted.current) {
        return;
      }
      const previous = lastStatus.current;
      lastStatus.current = next;
      setStatus(next);
      if (
        previous?.foreground?.id !== next.foreground?.id ||
        previous?.captureEnabled !== next.captureEnabled ||
        previous?.timer.phase !== next.timer.phase
      ) {
        invalidate(value => value + 1);
      }
    };
    const syncDate = () => {
      const date = dayStart(new Date());
      setToday(previous =>
        previous.getTime() === date.getTime()
          ? previous
          : date,
      );
    };
    const requestStatus = () => {
      tracker?.status().then(update, issue => {
        if (mounted.current) {
          setError(message(issue));
        }
      });
    };
    const sub = trackerEvents?.addListener('vizeChanged', update);
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') {
        syncDate();
        requestStatus();
        invalidate(value => value + 1);
      }
    });
    const tick = setInterval(() => {
      syncDate();
      if (lastStatus.current?.captureEnabled) {
        invalidate(value => value + 1);
      }
    }, 3000);
    requestStatus();
    return () => {
      mounted.current = false;
      sub?.remove();
      app.remove();
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    let current = true;
    tracker?.history(from, to).then(
      value => {
        if (current) {
          setHistory({ key, value });
          setReady(true);
        }
      },
      issue => {
        if (current) {
          setError(message(issue));
        }
      },
    );
    return () => {
      current = false;
    };
  }, [from, to, key, invalidated]);

  const run: Action = useCallback(async task => {
    if (busyRef.current) {
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await task();
      if (mounted.current) {
        invalidate(value => value + 1);
      }
      return true;
    } catch (issue) {
      if (mounted.current) {
        setError(message(issue));
      }
      return false;
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  }, []);

  if (!tracker) {
    return (
      <View
        style={[
          layout.root,
          {
            backgroundColor: c.page,
            padding: 28,
          },
        ]}
      >
        <Text
          style={[
            styles.heading,
            {
              color: c.ink,
            },
          ]}
        >
          Vize
        </Text>
        <Text
          style={{
            color: c.muted,
          }}
        >
          The macOS activity service is unavailable.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        layout.root,
        {
          backgroundColor: c.page,
        },
      ]}
    >
      <View
        style={[
          styles.between,
          styles.wrap,
          layout.header,
          {
            backgroundColor: c.card,
            borderBottomColor: c.border,
          },
        ]}
      >
        <View
          style={[
            styles.row,
            {
              gap: 10,
            },
          ]}
        >
          <View
            style={[
              layout.brandMark,
              {
                backgroundColor: c.accentSoft,
              },
            ]}
          >
            <View
              style={[
                layout.brandRing,
                {
                  borderColor: c.accent,
                },
              ]}
            />
          </View>
          <Text
            style={[
              layout.brand,
              {
                color: c.ink,
              },
            ]}
          >
            Vize
          </Text>
        </View>
        <View
          style={[
            styles.row,
            {
              gap: 4,
            },
          ]}
          accessibilityRole="tablist"
        >
          {tabs.map(name => (
            <Button
              key={name}
              label={name}
              kind="quiet"
              selected={name === tab}
              onPress={() => setTab(name)}
            />
          ))}
        </View>
        <View
          style={[
            styles.row,
            {
              gap: 7,
            },
          ]}
        >
          <Dot
            color={
              status?.captureEnabled
                ? c.accent
                : c.muted
            }
          />
          <Button
            label={
              status?.captureEnabled
                ? 'Pause capture'
                : 'Enable capture'
            }
            disabled={
              busy ||
              !status
            }
            onPress={() =>
              run(() => tracker!.setCapture(!status?.captureEnabled))
            }
          />
        </View>
      </View>
      {(error ||
      status?.error) && (
        <View
          style={[
            styles.between,
            layout.alert,
            {
              borderBottomColor: c.border,
            },
          ]}
        >
          <Text
            accessibilityRole="alert"
            style={{
              color: c.warning,
              flex: 1,
            }}
          >
            {error ||
              status?.error}
          </Text>
          {error && (
            <Button
              label="Dismiss"
              kind="quiet"
              onPress={() => setError(undefined)}
            />
          )}
        </View>
      )}
      {tab === 'Activity Journal'
        ? (
          <Journal
            date={journalDay}
            today={today}
            setDate={setJournalDay}
            data={data}
            busy={busy}
            narrow={narrow}
            run={run}
          />
        )
        : (
          <ScrollView
            style={layout.root}
            contentContainerStyle={layout.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {tab === 'Focus Desk'
              ? (
                <FocusDesk
                  today={today}
                  status={status}
                  data={data}
                  busy={busy}
                  ready={ready}
                  narrow={narrow}
                  run={run}
                />
              )
              : (
                <Report
                  date={reportDay}
                  today={today}
                  setDate={setReportDay}
                  mode={mode}
                  setMode={setMode}
                  data={data}
                  narrow={narrow}
                />
              )}
          </ScrollView>
        )}
      {tab !== 'Focus Desk' && (
        <View
          style={[
            styles.between,
            styles.wrap,
            layout.footer,
            {
              borderTopColor: c.border,
              backgroundColor: c.card,
            },
          ]}
        >
          <View
            style={[
              styles.row,
              {
                gap: 10,
              },
            ]}
          >
            <Text
              style={[
                styles.small,
                {
                  color: c.muted,
                },
              ]}
            >
              {timer.phase === 'focus'
                ? 'Focus session'
                : 'Short break'}
            </Text>
            <Text
              style={[
                styles.numbers,
                {
                  color: c.ink,
                  fontWeight: '700',
                  fontSize: 16,
                },
              ]}
            >
              {countdown(timer.remaining)}
            </Text>
          </View>
          <Button
            label={timerLabel(timer)}
            disabled={busy}
            onPress={() =>
              run(() =>
                tracker!.timerCommand(timer.deadline
                  ? 'pause'
                  : 'start'),
              )
            }
          />
        </View>
      )}
    </View>
  );
}

function Title({
  label,
  date,
  children,
}: React.PropsWithChildren<{
  label: string;
  date: string;
}>) {
  const c = usePalette();
  return (
    <View
      style={[
        styles.between,
        styles.wrap,
        {
          marginBottom: 18,
        },
      ]}
    >
      <View>
        <Text
          style={[
            styles.small,
            {
              color: c.muted,
              fontWeight: '600',
              marginBottom: 3,
            },
          ]}
        >
          {date}
        </Text>
        <Text
          accessibilityRole="header"
          style={[
            styles.heading,
            {
              color: c.ink,
            },
          ]}
        >
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

function timerLabel(timer: TimerStatus) {
  if (timer.deadline) {
    return 'Pause';
  }
  if (timer.hasStarted) {
    return 'Resume';
  }
  return timer.phase === 'focus'
    ? 'Start focus'
    : 'Start break';
}

function FocusDesk({
  today,
  status,
  data,
  busy,
  ready,
  narrow,
  run,
}: {
  today: Date;
  status?: Status;
  data: History;
  busy: boolean;
  ready: boolean;
  narrow: boolean;
  run: Action;
}) {
  const c = usePalette();
  const timer = status?.timer ?? emptyTimer;
  const [editing, setEditing] = useState(false);
  const [focus, setFocus] = useState('25');
  const [rest, setRest] = useState('5');
  const totals = summarize(data.activities, dayRange(today));

  return (
    <>
      <Title
        label="Focus Desk"
        date={fullDate(today)}
      />
      <View
        style={[
          layout.columns,
          narrow && layout.stacked,
        ]}
      >
        <View
          style={[
            layout.timerPanel,
            {
              backgroundColor: c.darkPanel,
            },
            !narrow && {
              flex: 1.08,
            },
          ]}
        >
          <View
            style={[
              styles.row,
              {
                gap: 7,
              },
            ]}
          >
            <Button
              label="Focus"
              selected={timer.phase === 'focus'}
              disabled={busy}
              onPress={() => run(() => tracker!.timerCommand('focus'))}
            />
            <Button
              label="Break"
              selected={timer.phase === 'rest'}
              disabled={busy}
              onPress={() => run(() => tracker!.timerCommand('rest'))}
            />
          </View>
          <View
            style={[
              layout.dial,
              {
                borderColor: c.track,
              },
            ]}
          >
            <Text
              style={[
                styles.numbers,
                layout.digits,
                {
                  color: c.inverse,
                },
              ]}
            >
              {countdown(timer.remaining)}
            </Text>
            <Text
              style={[
                styles.small,
                {
                  color: c.inverseMuted,
                },
              ]}
            >
              {timer.phase === 'focus'
                ? 'Focus session'
                : 'Short break'}
            </Text>
          </View>
          <View
            style={[
              styles.row,
              {
                gap: 8,
              },
            ]}
          >
            <Button
              label={timerLabel(timer)}
              kind="inverse"
              disabled={busy ||
                !status}
              onPress={() =>
                run(() =>
                  tracker!.timerCommand(timer.deadline
                    ? 'pause'
                    : 'start'),
                )
              }
            />
            <Button
              label="Reset"
              disabled={
                busy ||
                !status
              }
              onPress={() => run(() => tracker!.timerCommand('reset'))}
            />
          </View>
          <Text
            style={[
              styles.small,
              {
                color: c.inverseMuted,
              },
            ]}
          >
            {data.completed} completed Pomodoro{data.completed === 1
              ? ''
              : 's'}{' '}
            today
          </Text>
          {editing
            ? (
            <View
              style={[
                styles.row,
                styles.wrap,
                {
                  gap: 8,
                  justifyContent: 'center',
                },
              ]}
            >
              <Text
                style={[
                  styles.small,
                  {
                    color: c.inverse,
                  },
                ]}
              >
                Focus (min)
              </Text>
              <TextField
                accessibilityLabel="Focus minutes"
                value={focus}
                onChangeText={setFocus}
                maxLength={3}
                style={layout.minuteField}
              />
              <Text
                style={[
                  styles.small,
                  {
                    color: c.inverse,
                  },
                ]}
              >
                Break (min)
              </Text>
              <TextField
                accessibilityLabel="Break minutes"
                value={rest}
                onChangeText={setRest}
                maxLength={2}
                style={layout.minuteField}
              />
              <Button
                label="Save"
                disabled={
                  busy ||
                  !/^\d+$/.test(focus) ||
                  !/^\d+$/.test(rest)
                }
                onPress={async () => {
                  if (
                    await run(() =>
                      tracker!.setDurations(Number(focus), Number(rest)),
                    )
                  ) {
                    setEditing(false);
                  }
                }}
              />
              <Button
                label="Cancel"
                onPress={() => setEditing(false)}
              />
            </View>
          )
            : (
            <Button
              label="Edit durations"
              disabled={!status}
              onPress={() => {
                setFocus(String(timer.focusMinutes));
                setRest(String(timer.breakMinutes));
                setEditing(true);
              }}
            />
          )}
        </View>
        <Panel
          style={
            !narrow
              ? {
              flex: 1,
            }
              : undefined
          }
        >
          <View
            style={styles.between}
          >
            <Text
              style={[
                styles.section,
                {
                  color: c.ink,
                },
              ]}
            >
              Today’s activity
            </Text>
            <Text
              style={[
                styles.numbers,
                layout.total,
                {
                  color: c.ink,
                },
              ]}
            >
              {duration(totals.total)}
            </Text>
          </View>
          <View
            style={[
              styles.row,
              layout.foreground,
              {
                backgroundColor: c.panel,
              },
            ]}
          >
            <View
              style={[
                layout.appGlyph,
                {
                  backgroundColor: c.accentSoft,
                },
              ]}
            >
              <Text
                style={{
                  color: c.accent,
                  fontSize: 18,
                  fontWeight: '700',
                }}
              >
                {status?.foreground?.name.slice(0, 1) ?? '–'}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={[
                  styles.small,
                  {
                    color: c.muted,
                  },
                ]}
              >
                Foreground app
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: c.ink,
                  fontSize: 16,
                  fontWeight: '600',
                }}
              >
                {status?.foreground?.name ??
                  (status?.captureEnabled
                    ? 'Waiting for activity'
                    : 'Capture paused')}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.section,
              {
                color: c.ink,
                marginBottom: 12,
              },
            ]}
          >
            Time by category
          </Text>
          {totals.total > 0 && (
            <View
              style={[
                styles.row,
                layout.allocation,
                {
                  backgroundColor: c.panel,
                },
              ]}
            >
              {data.categories
                .filter(category => totals.categories.has(category.id))
                .map(category => (
                  <View
                    key={category.id}
                    style={{
                      height: 9,
                      flex: totals.categories.get(category.id),
                      backgroundColor: categoryColor(c, category.id),
                    }}
                  />
                ))}
            </View>
          )}
          {data.categories.map(category => (
            <CategoryRow
              key={category.id}
              category={category}
              value={duration(totals.categories.get(category.id) ?? 0)}
            />
          ))}
          {!totals.total && (
            <Text
              style={[
                styles.small,
                {
                  color: c.muted,
                  marginTop: 8,
                },
              ]}
            >
              {ready
                ? 'Activity will appear here as you use your apps.'
                : 'Loading activity…'}
            </Text>
          )}
        </Panel>
      </View>
    </>
  );
}

function CategoryRow({
  category,
  value,
}: {
  category: Category;
  value: string;
}) {
  const c = usePalette();
  return (
    <View
      style={[
        styles.between,
        layout.line,
        {
          borderBottomColor: c.border,
        },
      ]}
    >
      <View
        style={[
          styles.row,
          {
            gap: 8,
            flex: 1,
          },
        ]}
      >
        <Dot
          color={categoryColor(c, category.id)}
        />
        <Text
          numberOfLines={1}
          style={{
            color: c.ink,
            flexShrink: 1,
          }}
        >
          {category.name}
        </Text>
      </View>
      <Text
        style={[
          styles.numbers,
          {
            color: c.muted,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function DateNav({
  previous,
  next,
  reset,
  future,
}: {
  previous: () => void;
  next: () => void;
  reset: () => void;
  future: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        {
          gap: 6,
        },
      ]}
    >
      <Button
        label="‹"
        a11y="Previous period"
        onPress={previous}
      />
      <Button
        label="Today"
        onPress={reset}
      />
      <Button
        label="›"
        a11y="Next period"
        onPress={next}
        disabled={future}
      />
    </View>
  );
}

function Journal({
  date,
  today,
  setDate,
  data,
  busy,
  narrow,
  run,
}: {
  date: Date;
  today: Date;
  setDate: (date: Date) => void;
  data: History;
  busy: boolean;
  narrow: boolean;
  run: Action;
}) {
  const c = usePalette();
  const [selection, setSelection] = useState<number>();
  const [categoryID, setCategoryID] = useState<number>();
  const [asDefault, setDefault] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const range = dayRange(date);
  const selected = data.activities.find(activity => activity.id === selection);
  const total = summarize(data.activities, range).total;
  const names = new Map(
    data.categories.map(category => [category.id, category.name]),
  );

  const choose = (activity: Activity) => {
    setSelection(activity.id);
    setCategoryID(activity.categoryID);
    setDefault(false);
    setSaved(false);
  };
  const go = (day: Date) => {
    setSelection(undefined);
    setDate(day);
  };

  return (
    <View
      style={[
        layout.root,
        layout.scroll,
      ]}
    >
      <Title
        label="Activity Journal"
        date={fullDate(date)}
      >
        <DateNav
          previous={() => go(shiftDay(date, -1))}
          next={() => go(shiftDay(date, 1))}
          reset={() => go(today)}
          future={date >= today}
        />
      </Title>
      <View
        style={[
          layout.journalColumns,
          narrow && layout.stacked,
        ]}
      >
        <Panel style={layout.activityPanel}>
          <View
            style={styles.between}
          >
            <Text
              style={[
                styles.section,
                {
                  color: c.ink,
                },
              ]}
            >
              Activity log
            </Text>
            <Text
              style={[
                styles.numbers,
                {
                  color: c.muted,
                },
              ]}
            >
              {duration(total)} active
            </Text>
          </View>
          <ScrollView
            key={range.from}
            style={layout.root}
            keyboardShouldPersistTaps="handled"
          >
            {data.activities.length === 0 && (
              <Text
                style={[
                  styles.small,
                  {
                    color: c.muted,
                    marginTop: 14,
                  },
                ]}
              >
                No captured activity for this day.
              </Text>
            )}
            {data.activities.map(activity => (
              <Pressable
                key={activity.id}
                accessibilityRole="button"
                accessibilityState={{ selected: activity.id === selection }}
                onPress={() => choose(activity)}
                style={({ pressed }) => [
                  styles.between,
                  layout.activity,
                  {
                    backgroundColor:
                      pressed ||
                      activity.id === selection
                        ? c.accentSoft
                        : c.card,
                    borderBottomColor: c.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.small,
                    styles.numbers,
                    {
                      color: c.muted,
                      width: 76,
                    },
                  ]}
                >
                  {timeLabel(Math.max(activity.start, range.from))}
                </Text>
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      color: c.ink,
                      fontWeight: '600',
                    }}
                  >
                    {activity.appName}
                  </Text>
                  <View
                    style={[
                      styles.row,
                      {
                        gap: 6,
                      },
                    ]}
                  >
                    <Dot
                      color={categoryColor(c, activity.categoryID)}
                      size={6}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.small,
                        {
                          color: c.muted,
                          flexShrink: 1,
                        },
                      ]}
                    >
                      {names.get(activity.categoryID)}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.numbers,
                    {
                      color: c.ink,
                    },
                  ]}
                >
                  {duration(overlap(activity, range))}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Panel>
        <ScrollView
          style={[
            layout.categoryPanel,
            narrow && layout.stackedCategoryPanel,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Panel>
            <View
              style={[
                styles.between,
                styles.wrap,
              ]}
            >
              <Text
                style={[
                  styles.section,
                  {
                    color: c.ink,
                  },
                ]}
              >
                Categories
              </Text>
              <Button
                label={
                  creating
                    ? 'Cancel'
                    : 'New category'
                }
                kind="quiet"
                onPress={() => setCreating(!creating)}
              />
            </View>
            {creating && (
              <View
                style={[
                  styles.row,
                  {
                    gap: 6,
                    marginTop: 9,
                    marginBottom: 6,
                  },
                ]}
              >
                <TextField
                  accessibilityLabel="Category name"
                  placeholder="Category name"
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                  style={layout.categoryField}
                />
                <Button
                  label="Add"
                  kind="primary"
                  disabled={
                    busy ||
                    !name.trim()
                  }
                  onPress={async () => {
                    if (await run(() => tracker!.createCategory(name))) {
                      setName('');
                      setCreating(false);
                    }
                  }}
                />
              </View>
            )}
            {selected
              ? (
              <>
                <Text
                  style={{
                    color: c.ink,
                    fontSize: 19,
                    fontWeight: '700',
                    marginTop: 15,
                  }}
                >
                  {selected.appName}
                </Text>
                <Text
                  style={[
                    styles.small,
                    {
                      color: c.muted,
                      marginBottom: 11,
                    },
                  ]}
                >
                  {timeLabel(Math.max(selected.start, range.from))} ·{' '}
                  {duration(overlap(selected, range))}
                </Text>
                <View
                  style={[
                    styles.row,
                    styles.wrap,
                    {
                      gap: 6,
                    },
                  ]}
                >
                  {data.categories.map(category => (
                    <Button
                      key={category.id}
                      label={category.name}
                      selected={category.id === categoryID}
                      onPress={() => {
                        setCategoryID(category.id);
                        setSaved(false);
                      }}
                    />
                  ))}
                </View>
                <View
                  style={[
                    styles.row,
                    {
                      gap: 8,
                      marginVertical: 14,
                    },
                  ]}
                >
                  <Switch
                    accessibilityLabel="Use for future blocks from this app"
                    value={asDefault}
                    onValueChange={value => {
                      setDefault(value);
                      setSaved(false);
                    }}
                  />
                  <Text
                    style={[
                      styles.small,
                      {
                        color: c.muted,
                        flexShrink: 1,
                      },
                    ]}
                  >
                    Use for future blocks from this app
                  </Text>
                </View>
                <Button
                  label="Save category"
                  kind="primary"
                  disabled={
                    busy ||
                    categoryID === undefined
                  }
                  onPress={async () => {
                    if (
                      categoryID !== undefined &&
                      (await run(() =>
                        tracker!.assignCategory(
                          selected.id,
                          categoryID,
                          asDefault,
                        ),
                      ))
                    ) {
                      setSaved(true);
                    }
                  }}
                />
                {saved && (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[
                      styles.small,
                      {
                        color: c.accent,
                        marginTop: 8,
                      },
                    ]}
                  >
                    Category saved.
                  </Text>
                )}
              </>
            )
              : (
              <Text
                style={[
                  styles.small,
                  {
                    color: c.muted,
                    marginTop: 13,
                  },
                ]}
              >
                Select an activity block to assign a category.
              </Text>
            )}
          </Panel>
        </ScrollView>
      </View>
    </View>
  );
}

function Report({
  date,
  today,
  setDate,
  mode,
  setMode,
  data,
  narrow,
}: {
  date: Date;
  today: Date;
  setDate: (date: Date) => void;
  mode: 'day' | 'week';
  setMode: (mode: 'day' | 'week') => void;
  data: History;
  narrow: boolean;
}) {
  const c = usePalette();
  const [categoryID, setCategoryID] = useState<number>();
  const start =
    mode === 'week'
      ? weekStart(date)
      : date;
  const count =
    mode === 'week'
      ? 7
      : 1;
  const range: Range = { from: unix(start), to: unix(shiftDay(start, count)) };
  const summary = summarize(data.activities, range);
  const days = Array.from({ length: count }, (_, offset) => {
    const value = shiftDay(start, offset);
    return { value, summary: summarize(data.activities, dayRange(value)) };
  });
  const busiest = Math.max(1, ...days.map(day => day.summary.total));
  const selected = data.categories.find(category => category.id === categoryID);
  const active =
    selected ??
    data.categories.find(category => summary.categories.has(category.id));
  const apps =
    active
    ? [...(summary.apps.get(active.id)?.entries() ?? [])].sort(
        (a, b) => b[1].seconds - a[1].seconds,
      )
    : [];
  const period =
    mode === 'week'
      ? `${shortDate(start)} – ${shortDate(shiftDay(start, 6))}, ${shiftDay(
          start,
          6,
        ).getFullYear()}`
      : fullDate(date);

  return (
    <>
      <Title
        label="Weekly Review"
        date={period}
      >
        <View
          style={[
            styles.row,
            {
              gap: 9,
            },
          ]}
        >
          <DateNav
            previous={() => setDate(shiftDay(start, -count))}
            next={() => setDate(shiftDay(start, count))}
            reset={() => setDate(today)}
            future={
              mode === 'week'
                ? start >= weekStart(today)
                : start >= today
            }
          />
          <Button
            label="Day"
            selected={mode === 'day'}
            onPress={() => setMode('day')}
          />
          <Button
            label="Week"
            selected={mode === 'week'}
            onPress={() => setMode('week')}
          />
        </View>
      </Title>
      <View
        style={[
          layout.columns,
          narrow && layout.stacked,
        ]}
      >
        <Panel
          style={
            !narrow
              ? {
              flex: 1.7,
            }
              : undefined
          }
        >
          <Text
            style={[
              styles.small,
              {
                color: c.muted,
              },
            ]}
          >
            Total active time
          </Text>
          <Text
            style={[
              styles.numbers,
              layout.total,
              {
                color: c.ink,
              },
            ]}
          >
            {duration(summary.total)}
          </Text>
          <View
            style={[
              layout.chart,
              {
                borderBottomColor: c.border,
              },
            ]}
          >
            {days.map(day => {
              const label = dateLabel(day.value, { weekday: 'short' });
              return (
                <View
                  key={day.value.getTime()}
                  accessible
                  accessibilityLabel={`${label}, ${duration(
                    day.summary.total,
                  )} active`}
                  style={layout.chartColumn}
                >
                  <Text
                    style={[
                      styles.numbers,
                      styles.small,
                      {
                        color: c.muted,
                      },
                    ]}
                  >
                    {duration(day.summary.total)}
                  </Text>
                  <View
                    style={[
                      layout.barArea,
                      {
                        backgroundColor: c.panel,
                      },
                    ]}
                  >
                    <View
                      style={{
                        height: (122 * day.summary.total) / busiest,
                        width: '100%',
                        overflow: 'hidden',
                        borderRadius: 4,
                        flexDirection: 'column-reverse',
                      }}
                    >
                      {data.categories
                        .filter(category =>
                          day.summary.categories.has(category.id),
                        )
                        .map(category => (
                          <View
                            key={category.id}
                            style={{
                              flex: day.summary.categories.get(category.id),
                              backgroundColor: categoryColor(c, category.id),
                              opacity:
                                active &&
                                active.id !== category.id
                                  ? 0.5
                                  : 1,
                            }}
                          />
                        ))}
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.small,
                      {
                        color: c.muted,
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
          <View
            style={[
              styles.row,
              styles.wrap,
              {
                gap: 6,
                marginTop: 12,
              },
            ]}
          >
            {data.categories.map(category => (
              <Button
                key={category.id}
                label={`${category.name} · ${duration(
                  summary.categories.get(category.id) ?? 0,
                )}`}
                selected={category.id === active?.id}
                onPress={() => setCategoryID(category.id)}
              />
            ))}
          </View>
        </Panel>
        <Panel
          style={
            !narrow
              ? {
              flex: 1,
            }
              : undefined
          }
        >
          <Text
            style={[
              styles.small,
              {
                color: c.muted,
                marginBottom: 5,
              },
            ]}
          >
            Apps in category
          </Text>
          <Text
            style={[
              styles.section,
              {
                color: c.ink,
              },
            ]}
          >
            {active?.name ?? 'No activity'}
          </Text>
          {active && (
            <Text
              style={[
                styles.small,
                {
                  color: c.muted,
                  marginTop: 4,
                  marginBottom: 8,
                },
              ]}
            >
              {duration(summary.categories.get(active.id) ?? 0)} active
            </Text>
          )}
          {apps.map(([id, app]) => (
            <View
              key={id}
              style={[
                styles.between,
                layout.line,
                {
                  borderBottomColor: c.border,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: c.ink,
                  flexShrink: 1,
                }}
              >
                {app.name}
              </Text>
              <Text
                style={[
                  styles.numbers,
                  {
                    color: c.muted,
                  },
                ]}
              >
                {duration(app.seconds)}
              </Text>
            </View>
          ))}
          {apps.length === 0 && (
            <Text
              style={[
                styles.small,
                {
                  color: c.muted,
                  marginTop: 12,
                },
              ]}
            >
              No app activity in this period.
            </Text>
          )}
        </Panel>
      </View>
    </>
  );
}

const layout = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 21,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  brand: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.65,
  },
  brandMark: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRing: {
    width: 13,
    height: 13,
    borderWidth: 2,
    borderRadius: 7,
    borderRightWidth: 4,
  },
  alert: {
    paddingHorizontal: 22,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 15,
  },
  stacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  journalColumns: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    gap: 15,
  },
  activityPanel: {
    flex: 1.6,
    minHeight: 0,
  },
  categoryPanel: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  stackedCategoryPanel: {
    flex: 0,
    maxHeight: '55%',
  },
  timerPanel: {
    alignItems: 'center',
    gap: 15,
    padding: 21,
    borderRadius: 16,
  },
  dial: {
    width: 190,
    height: 190,
    borderWidth: 4,
    borderRadius: 95,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digits: {
    fontSize: 51,
    lineHeight: 58,
    fontWeight: '600',
    letterSpacing: -3,
  },
  total: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  foreground: {
    minHeight: 66,
    padding: 10,
    borderRadius: 10,
    marginVertical: 17,
    gap: 10,
  },
  appGlyph: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  minuteField: {
    width: 50,
  },
  categoryField: {
    flex: 1,
    minWidth: 0,
  },
  allocation: {
    borderRadius: 4,
    gap: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  line: {
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activity: {
    minHeight: 49,
    marginTop: 4,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 14,
    paddingBottom: 9,
    gap: 5,
    borderBottomWidth: 1,
  },
  chartColumn: {
    alignItems: 'center',
    minWidth: 0,
    flex: 1,
    gap: 5,
  },
  barArea: {
    height: 122,
    width: '74%',
    maxWidth: 52,
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
});
