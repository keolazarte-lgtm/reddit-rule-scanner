import { SubredditScan, SavedSubreddit } from '../types';

const SCANS_KEY = 'reddit_scanner_scans';
const SAVED_KEY = 'reddit_scanner_saved';
const HISTORY_KEY = 'reddit_scanner_history';

export function getScans(): SubredditScan[] {
  const data = localStorage.getItem(SCANS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveScan(scan: SubredditScan): void {
  const scans = getScans();
  const existing = scans.findIndex(s => s.subreddit === scan.subreddit);
  if (existing >= 0) {
    scans[existing] = scan;
  } else {
    scans.push(scan);
  }
  localStorage.setItem(SCANS_KEY, JSON.stringify(scans));
  
  const history = getScanHistory(scan.subreddit);
  history.push({ ...scan, scannedAt: Date.now() });
  localStorage.setItem(`${HISTORY_KEY}_${scan.subreddit}`, JSON.stringify(history));
}

export function getScanHistory(subreddit: string): SubredditScan[] {
  const data = localStorage.getItem(`${HISTORY_KEY}_${subreddit}`);
  return data ? JSON.parse(data) : [];
}

export function getSavedSubreddits(): SavedSubreddit[] {
  const data = localStorage.getItem(SAVED_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveSubreddit(saved: SavedSubreddit): void {
  const savedList = getSavedSubreddits();
  savedList.push(saved);
  localStorage.setItem(SAVED_KEY, JSON.stringify(savedList));
}

export function removeSavedSubreddit(id: string): void {
  const savedList = getSavedSubreddits().filter(s => s.id !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(savedList));
}

export function updateSavedSubreddit(id: string, updates: Partial<SavedSubreddit>): void {
  const savedList = getSavedSubreddits().map(s => s.id === id ? { ...s, ...updates } : s);
  localStorage.setItem(SAVED_KEY, JSON.stringify(savedList));
}
