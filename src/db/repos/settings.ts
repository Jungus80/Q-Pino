import { getDb } from '../client';

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const res = await db.execute('SELECT value FROM settings WHERE key = ?', [key]);
  return (res.rows?.[0]?.value as string | undefined) ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

const OBSERVER_NAME_KEY = 'observerName';

export async function getObserverName(): Promise<string | null> {
  return getSetting(OBSERVER_NAME_KEY);
}

export async function setObserverName(name: string): Promise<void> {
  return setSetting(OBSERVER_NAME_KEY, name.trim());
}
