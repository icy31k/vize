import {
  NativeEventEmitter,
  NativeModules,
} from 'react-native';
import type {
  AccountPlatform,
} from './accountClient';
import type {
  History,
  Status,
} from './tracker';

type Bridge = AccountPlatform & {
  status(): Promise<Status>;
  history(from: number, to: number): Promise<History>;
  setCapture(enabled: boolean): Promise<void>;
  createCategory(name: string): Promise<void>;
  assignCategory(
    id: number,
    category: number,
    saveDefault: boolean,
  ): Promise<void>;
  assignGroupCategory(
    ids: number[],
    category: number,
    saveDefault: boolean,
  ): Promise<void>;
  timerCommand(
    command: 'start' | 'pause' | 'reset' | 'focus' | 'rest',
  ): Promise<void>;
  setDurations(focus: number, rest: number): Promise<void>;
  addListener(event: string): void;
  removeListeners(count: number): void;
};

export const tracker: Bridge | undefined = NativeModules.VizeBridge;
export const trackerEvents =
  tracker
  ? new NativeEventEmitter(tracker)
  : undefined;
