// A signal kept in Storage: it loads once, and every change is saved. For what the app keeps on this device only.
import { signal, Storage } from "nsh";

export interface Persisted<T> {
  (): T;
  set(value: T): void;
  update(fn: (value: T) => T): void;
  /** Resolves once the stored value is in. */
  ready: Promise<void>;
}

export function persisted<T>(key: string, initial: T): Persisted<T> {
  const value = signal<T>(initial);
  // A change made before the stored value is in wins over it, rather than being overwritten when it arrives.
  let changed = false;
  const ready = Storage.getItem(key)
    .then((raw) => {
      if (raw && !changed) value.set(JSON.parse(raw) as T);
    })
    .catch(() => {});
  const save = (next: T) => {
    changed = true;
    value.set(next);
    Storage.setItem(key, JSON.stringify(next)).catch(() => {});
  };
  const read = (() => value()) as Persisted<T>;
  read.set = save;
  read.update = (fn) => save(fn(value()));
  read.ready = ready;
  return read;
}
