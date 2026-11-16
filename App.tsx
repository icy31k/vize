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
  AccountMenu,
  useToolbarAccount,
} from './src/account';
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
  const account = useToolbarAccount();
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
  const accountLabel = account.profile
    ? 'Account'
    : 'Guest';

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
          layout.unavailable,
          {
            backgroundColor: c.page,
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
            layout.brandRow,
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
            layout.tabControls,
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
            layout.captureControls,
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
          <Button
            label={accountLabel}
            showChevron
            expanded={account.open}
            selected={account.open}
            disabled={account.busy}
            onPress={account.toggle}
          />
        </View>
      </View>
      <View style={layout.root}>
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
              style={[
                layout.root,
                {
                  color: c.warning,
                },
              ]}
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
        {account.open && (
          <View style={layout.accountOverlay}>
            <AccountMenu
              account={account}
            />
          </View>
        )}
      </View>
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
              layout.footerTimer,
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
                layout.footerCountdown,
                {
                  color: c.ink,
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
        layout.title,
      ]}
    >
      <View>
        <Text
          style={[
            styles.small,
            layout.titleDate,
            {
              color: c.muted,
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
  const categoriesByDuration = data.categories
    .map(category => ({
      category,
      seconds: totals.categories.get(category.id) ?? 0,
    }))
    .sort((a, b) => b.seconds - a.seconds);

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
            !narrow && layout.wideTimerPanel,
          ]}
        >
          <View
            style={[
              styles.row,
              layout.timerPhaseControls,
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
              layout.timerControls,
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
                layout.durationEditor,
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
              ? layout.root
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
                style={[
                  layout.appGlyphLabel,
                  {
                    color: c.accent,
                  },
                ]}
              >
                {status?.foreground?.name.slice(0, 1) ?? '–'}
              </Text>
            </View>
            <View
              style={layout.root}
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
                style={[
                  layout.foregroundName,
                  {
                    color: c.ink,
                  },
                ]}
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
              layout.categoryHeading,
              {
                color: c.ink,
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
              {categoriesByDuration
                .filter(({ seconds }) => seconds > 0)
                .map(({ category, seconds }) => (
                  <View
                    key={category.id}
                    style={[
                      layout.allocationSegment,
                      {
                        flex: seconds,
                        backgroundColor: categoryColor(c, category.id),
                      },
                    ]}
                  />
                ))}
            </View>
          )}
          {categoriesByDuration.map(({ category, seconds }) => (
            <CategoryRow
              key={category.id}
              category={category}
              value={duration(seconds)}
            />
          ))}
          {!totals.total && (
            <Text
              style={[
                styles.small,
                layout.statusMessage,
                {
                  color: c.muted,
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
          layout.categoryRowLabel,
        ]}
      >
        <Dot
          color={categoryColor(c, category.id)}
        />
        <Text
          numberOfLines={1}
          style={[
            layout.shrink,
            {
              color: c.ink,
            },
          ]}
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
        layout.dateControls,
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

type JournalGroup = {
  appID: string;
  appName: string;
  activities: Activity[];
  seconds: number;
  categories: Set<number>;
};

function Journal({
  date,
  today,
  setDate,
  data,
  busy,
  run,
}: {
  date: Date;
  today: Date;
  setDate: (date: Date) => void;
  data: History;
  busy: boolean;
  run: Action;
}) {
  const c = usePalette();
  const [view, setView] = useState<'grouped' | 'timeline'>('grouped');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selection, setSelection] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string>();
  const range = dayRange(date);
  const groups = new Map<string, JournalGroup>();
  const names = new Map(
    data.categories.map(category => [category.id, category.name]),
  );
  let total = 0;

  for (const activity of data.activities) {
    const seconds = overlap(activity, range);
    total += seconds;
    let group = groups.get(activity.appID);
    if (!group) {
      group = {
        appID: activity.appID,
        appName: activity.appName,
        activities: [],
        seconds: 0,
        categories: new Set(),
      };
      groups.set(activity.appID, group);
    }
    group.activities.push(activity);
    group.seconds += seconds;
    group.categories.add(activity.categoryID);
  }

  const groupsByDuration = Array.from(groups.values()).sort(
    (a, b) => b.seconds - a.seconds,
  );

  const choose = (key: string) => {
    setSelection(previous =>
      previous === key
        ? undefined
        : key,
    );
    setSaved(undefined);
  };

  const changeView = (next: typeof view) => {
    if (next === view) {
      return;
    }
    setView(next);
    setSelection(undefined);
    setSaved(undefined);
  };

  const go = (day: Date) => {
    setSelection(undefined);
    setExpanded(new Set());
    setSaved(undefined);
    setDate(day);
  };

  const renderEditor = (
    key: string,
    appName: string,
    activities: Activity[],
    categoryID: number | undefined,
    forGroup: boolean,
  ) => {
    if (key !== selection) {
      return null;
    }
    return (
      <JournalCategoryEditor
        key={key}
        appName={appName}
        activities={activities}
        initialCategoryID={categoryID}
        categories={data.categories}
        range={range}
        forGroup={forGroup}
        busy={busy}
        run={run}
        onCancel={() => setSelection(undefined)}
        onSave={categoryName => {
          setSelection(previous =>
            previous === key
              ? undefined
              : previous,
          );
          setSaved(
            forGroup
              ? `${appName} · ${activities.length} entries set to ${categoryName}.`
              : `${appName} at ${timeLabel(Math.max(activities[0].start, range.from))} set to ${categoryName}.`,
          );
        }}
      />
    );
  };

  const renderActivity = (activity: Activity, grouped: boolean) => {
    const key = `entry:${activity.id}`;
    const time = timeLabel(Math.max(activity.start, range.from));
    const category = names.get(activity.categoryID);
    return (
      <View key={key}>
        <JournalRow
          label={
            grouped
              ? time
              : activity.appName
          }
          detail={
            grouped
              ? undefined
              : time
          }
          a11y={`Select ${activity.appName} at ${time}, ${category ?? 'Uncategorized'}`}
          category={category}
          categoryID={activity.categoryID}
          seconds={overlap(activity, range)}
          selected={selection === key}
          onPress={() => choose(key)}
        />
        {renderEditor(key, activity.appName, [activity], activity.categoryID, false)}
      </View>
    );
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
      <Panel style={layout.activityPanel}>
        <View
          style={[
            styles.between,
            styles.wrap,
          ]}
        >
          <View style={layout.journalControls}>
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
                styles.small,
                styles.numbers,
                {
                  color: c.muted,
                },
              ]}
            >
              {duration(total)} active
            </Text>
          </View>
          <View style={layout.journalControls}>
            <Button
              label="Grouped by app"
              selected={view === 'grouped'}
              onPress={() => changeView('grouped')}
            />
            <Button
              label="Timeline"
              selected={view === 'timeline'}
              onPress={() => changeView('timeline')}
            />
            <Button
              label={
                creating
                  ? 'Cancel'
                  : 'New category'
              }
              a11y={
                creating
                  ? 'Cancel creating category'
                  : 'New category'
              }
              kind="quiet"
              onPress={() => setCreating(previous => !previous)}
            />
          </View>
        </View>
        {creating && (
          <View style={layout.categoryCreation}>
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
        <ScrollView
          key={`${range.from}/${view}`}
          style={layout.root}
          keyboardShouldPersistTaps="handled"
        >
          {data.activities.length === 0 && (
            <Text
              style={[
                styles.small,
                layout.emptyJournal,
                {
                  color: c.muted,
                },
              ]}
            >
              No captured activity for this day.
            </Text>
          )}
          {view === 'grouped'
            ? groupsByDuration.map(group => {
              const key = `app:${group.appID}`;
              const open = expanded.has(group.appID);
              const count = group.activities.length;
              const entryCount =
                count === 1
                  ? '1 entry'
                  : `${count} entries`;
              const disclosureLabel =
                open
                  ? `Collapse ${group.appName} entries`
                  : `Expand ${group.appName} entries`;
              const mixed = group.categories.size > 1;
              const categoryID =
                mixed
                  ? undefined
                  : group.activities[0].categoryID;
              const category =
                categoryID === undefined
                  ? 'Mixed categories'
                  : names.get(categoryID);
              return (
                <View key={key}>
                  <View style={styles.row}>
                    <Button
                      label={
                        open
                          ? '⌄'
                          : '›'
                      }
                      a11y={disclosureLabel}
                      expanded={open}
                      kind="quiet"
                      style={layout.disclosure}
                      onPress={() => {
                        const next = new Set(expanded);
                        if (open) {
                          next.delete(group.appID);
                          if (group.activities.some(activity => `entry:${activity.id}` === selection)) {
                            setSelection(undefined);
                          }
                        } else {
                          next.add(group.appID);
                        }
                        setExpanded(next);
                      }}
                    />
                    <JournalRow
                      label={group.appName}
                      detail={entryCount}
                      a11y={`Edit ${group.appName} group, ${entryCount}, ${category ?? 'Uncategorized'}`}
                      category={category}
                      categoryID={categoryID}
                      seconds={group.seconds}
                      selected={selection === key}
                      onPress={() => choose(key)}
                    />
                  </View>
                  {(open || selection === key) && (
                    <View
                      style={[
                        layout.journalEntries,
                        {
                          borderLeftColor: c.border,
                        },
                      ]}
                    >
                      {renderEditor(key, group.appName, group.activities, categoryID, true)}
                      {open && group.activities.map(activity => renderActivity(activity, true))}
                    </View>
                  )}
                </View>
              );
            })
            : data.activities.map(activity => renderActivity(activity, false))}
        </ScrollView>
        {saved && (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.small,
              layout.statusMessage,
              {
                color: c.accent,
              },
            ]}
          >
            {saved}
          </Text>
        )}
      </Panel>
    </View>
  );
}

function JournalRow({
  label,
  detail,
  a11y,
  category,
  categoryID,
  seconds,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  a11y: string;
  category?: string;
  categoryID?: number;
  seconds: number;
  selected: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{
        selected,
      }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.between,
        layout.activity,
        {
          backgroundColor:
            pressed ||
            selected
              ? c.accentSoft
              : c.card,
          borderBottomColor: c.border,
        },
      ]}
    >
      <View style={layout.journalRowTitle}>
        <Text
          numberOfLines={1}
          style={[
            layout.journalRowLabel,
            {
              color: c.ink,
            },
          ]}
        >
          {label}
        </Text>
        {detail && (
          <Text
            style={[
              styles.small,
              {
                color: c.muted,
              },
            ]}
          >
            {detail}
          </Text>
        )}
      </View>
      <View style={layout.journalRowCategory}>
        {categoryID !== undefined && (
          <Dot
            color={categoryColor(c, categoryID)}
            size={6}
          />
        )}
        <Text
          numberOfLines={1}
          style={[
            styles.small,
            layout.shrink,
            {
              color: c.muted,
            },
          ]}
        >
          {category}
        </Text>
      </View>
      <Text
        style={[
          styles.numbers,
          layout.journalDuration,
          {
            color: c.ink,
          },
        ]}
      >
        {duration(seconds)}
      </Text>
    </Pressable>
  );
}

function JournalCategoryEditor({
  appName,
  activities,
  initialCategoryID,
  categories,
  range,
  forGroup,
  busy,
  run,
  onCancel,
  onSave,
}: {
  appName: string;
  activities: Activity[];
  initialCategoryID?: number;
  categories: Category[];
  range: Range;
  forGroup: boolean;
  busy: boolean;
  run: Action;
  onCancel: () => void;
  onSave: (categoryName: string) => void;
}) {
  const c = usePalette();
  const [categoryID, setCategoryID] = useState(initialCategoryID);
  const [asDefault, setDefault] = useState(true);
  const first = activities[0];
  const count = activities.length;
  const category = categories.find(item => item.id === categoryID);
  const entryLabel =
    count === 1
      ? 'entry'
      : 'entries';
  const editingMixedGroup =
    forGroup &&
    initialCategoryID === undefined;
  const crossesDay = activities.some(activity =>
    activity.start < range.from ||
    activity.end > range.to,
  );
  return (
    <View
      style={[
        layout.journalEditor,
        {
          backgroundColor: c.panel,
        },
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
        {forGroup
          ? `${appName} · ${count} ${entryLabel} for this day`
          : `${appName} · ${timeLabel(Math.max(first.start, range.from))} · 1 entry`}
      </Text>
      {editingMixedGroup && (
        <Text
          style={[
            styles.small,
            {
              color: c.muted,
            },
          ]}
        >
          Applying a category replaces the individual categories in this group.
        </Text>
      )}
      {crossesDay && (
        <Text
          style={[
            styles.small,
            {
              color: c.muted,
            },
          ]}
        >
          Changes apply to whole blocks, including any time outside this day.
        </Text>
      )}
      <View style={layout.journalControls}>
        {categories.map(item => (
          <Button
            key={item.id}
            label={item.name}
            selected={item.id === categoryID}
            disabled={busy}
            onPress={() => setCategoryID(item.id)}
          />
        ))}
      </View>
      <View style={layout.journalControls}>
        <Switch
          accessibilityLabel="Use for future blocks from this app"
          value={asDefault}
          disabled={busy}
          onValueChange={setDefault}
        />
        <Text
          style={[
            styles.small,
            layout.shrink,
            {
              color: c.muted,
            },
          ]}
        >
          Use for future blocks from this app
        </Text>
      </View>
      <View style={layout.journalControls}>
        <Button
          label={
            forGroup &&
            count > 1
              ? `Apply to all ${count} entries`
              : 'Apply to this entry'
          }
          kind="primary"
          disabled={
            busy ||
            category === undefined
          }
          onPress={async () => {
            if (!category) {
              return;
            }
            const applied = await run(() =>
              forGroup
                ? tracker!.assignGroupCategory(
                    activities.map(activity => activity.id),
                    category.id,
                    asDefault,
                  )
                : tracker!.assignCategory(first.id, category.id, asDefault),
            );
            if (applied) {
              onSave(category.name);
            }
          }}
        />
        <Button
          label="Cancel"
          disabled={busy}
          onPress={onCancel}
        />
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
            layout.reviewControls,
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
              ? layout.wideReviewPanel
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
                      style={[
                        layout.chartStack,
                        {
                          height: (122 * day.summary.total) / busiest,
                        },
                      ]}
                    >
                      {data.categories
                        .filter(category =>
                          day.summary.categories.has(category.id),
                        )
                        .map(category => (
                          <View
                            key={category.id}
                            style={[
                              active &&
                              active.id !== category.id &&
                                layout.inactiveChartSegment,
                              {
                                flex: day.summary.categories.get(category.id),
                                backgroundColor: categoryColor(c, category.id),
                              },
                            ]}
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
              layout.reviewCategories,
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
              ? layout.root
              : undefined
          }
        >
          <Text
            style={[
              styles.small,
              layout.reviewCategoryHeading,
              {
                color: c.muted,
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
                layout.reviewCategoryTotal,
                {
                  color: c.muted,
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
                style={[
                  layout.shrink,
                  {
                    color: c.ink,
                  },
                ]}
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
                layout.emptyReview,
                {
                  color: c.muted,
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
  unavailable: {
    padding: 28,
  },
  header: {
    paddingHorizontal: 21,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  accountOverlay: {
    position: 'absolute',
    top: 6,
    right: 21,
    width: 330,
    zIndex: 2,
  },
  tabControls: {
    gap: 4,
  },
  captureControls: {
    gap: 7,
  },
  brand: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.65,
  },
  brandRow: {
    gap: 10,
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
  title: {
    marginBottom: 18,
  },
  titleDate: {
    fontWeight: '600',
    marginBottom: 3,
  },
  dateControls: {
    gap: 6,
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
  activityPanel: {
    flex: 1,
    minHeight: 0,
    gap: 8,
  },
  emptyJournal: {
    marginTop: 14,
  },
  statusMessage: {
    marginTop: 8,
  },
  journalControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  categoryCreation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 420,
  },
  disclosure: {
    width: 33,
    paddingHorizontal: 0,
  },
  journalEntries: {
    marginLeft: 16,
    paddingLeft: 20,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  journalRowTitle: {
    flex: 1,
    minWidth: 0,
  },
  journalRowLabel: {
    fontWeight: '600',
  },
  shrink: {
    flexShrink: 1,
  },
  journalRowCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    maxWidth: '38%',
    gap: 6,
  },
  journalDuration: {
    minWidth: 48,
    textAlign: 'right',
  },
  journalEditor: {
    padding: 12,
    marginVertical: 6,
    borderRadius: 8,
    gap: 8,
  },
  timerPanel: {
    alignItems: 'center',
    gap: 15,
    padding: 21,
    borderRadius: 16,
  },
  wideTimerPanel: {
    flex: 1.08,
  },
  timerPhaseControls: {
    gap: 7,
  },
  timerControls: {
    gap: 8,
  },
  durationEditor: {
    gap: 8,
    justifyContent: 'center',
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
  foregroundName: {
    fontSize: 16,
    fontWeight: '600',
  },
  appGlyph: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  appGlyphLabel: {
    fontSize: 18,
    fontWeight: '700',
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
  categoryHeading: {
    marginBottom: 12,
  },
  allocationSegment: {
    height: 9,
  },
  categoryRowLabel: {
    gap: 8,
    flex: 1,
  },
  line: {
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activity: {
    flex: 1,
    minWidth: 0,
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
  footerTimer: {
    gap: 10,
  },
  footerCountdown: {
    fontWeight: '700',
    fontSize: 16,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 14,
    paddingBottom: 9,
    gap: 5,
    borderBottomWidth: 1,
  },
  reviewControls: {
    gap: 9,
  },
  wideReviewPanel: {
    flex: 1.7,
  },
  reviewCategories: {
    gap: 6,
    marginTop: 12,
  },
  reviewCategoryHeading: {
    marginBottom: 5,
  },
  reviewCategoryTotal: {
    marginTop: 4,
    marginBottom: 8,
  },
  emptyReview: {
    marginTop: 12,
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
  chartStack: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 4,
    flexDirection: 'column-reverse',
  },
  inactiveChartSegment: {
    opacity: 0.5,
  },
});
