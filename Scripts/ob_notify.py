import argparse
import json
import math
import os
import time
import urllib.request

# Pushes a phone notification (via ntfy.sh) when an OpenBench test finishes or stops.
# Config comes from Scripts/ob_notify.config (JSON) and can be overridden by environment variables:
#   topic     / OB_NTFY_TOPIC  : ntfy topic to publish to. Treat it like a password.
#   base_url  / OB_BASE_URL    : OpenBench server, default https://ob.kjljixx.com
#   authors   / OB_AUTHORS     : comma separated; only these authors' tests are watched. Empty watches everyone.
#   interval  / OB_INTERVAL    : seconds between polls, default 60
# State is kept in Scripts/ob_notify.state so a restart does not repeat or miss notifications.

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, 'ob_notify.config')
STATE_PATH = os.path.join(SCRIPT_DIR, 'ob_notify.state')
LOG_PATH = os.path.join(SCRIPT_DIR, 'ob_notify.log')
SEED_PROBE_START = 190
USER_AGENT = 'ob-notify/1.0'


def log(message):
  line = '%s %s' % (time.strftime('%Y-%m-%d %H:%M:%S'), message)
  print(line, flush=True)
  with open(LOG_PATH, 'a') as f:
    f.write(line + '\n')


def load_config():
  config = {}
  if os.path.isfile(CONFIG_PATH):
    with open(CONFIG_PATH) as f:
      config = json.load(f)

  authors = os.environ.get('OB_AUTHORS', config.get('authors', ['kjljixx']))
  if isinstance(authors, str):
    authors = [a.strip() for a in authors.split(',') if a.strip()]

  return {
    'topic': os.environ.get('OB_NTFY_TOPIC', config.get('topic', '')),
    'base_url': os.environ.get('OB_BASE_URL', config.get('base_url', 'https://ob.kjljixx.com')).rstrip('/'),
    'authors': authors,
    'interval': int(os.environ.get('OB_INTERVAL', config.get('interval', 60))),
  }


def load_state():
  if os.path.isfile(STATE_PATH):
    with open(STATE_PATH) as f:
      return json.load(f)
  return None


def save_state(state):
  with open(STATE_PATH, 'w') as f:
    json.dump(state, f)


def fetch_info(config, workload_id):
  request = urllib.request.Request('%s/api/workload/%d/info/' % (config['base_url'], workload_id), data=b'', method='POST', headers={'User-Agent': USER_AGENT})
  with urllib.request.urlopen(request, timeout=20) as response:
    body = json.load(response)
  return body.get('info')


def penta_elo(penta):
  games = sum(penta)
  if games == 0:
    return None
  scores = [0, 0.25, 0.5, 0.75, 1]
  mean = sum(count * score for count, score in zip(penta, scores)) / games
  if not 0 < mean < 1:
    return None
  variance = sum(count * (score - mean) ** 2 for count, score in zip(penta, scores)) / games
  to_elo = lambda x: -400 * math.log10(1 / x - 1)
  margin = 1.96 * math.sqrt(variance / games)
  low, high = max(mean - margin, 1e-9), min(mean + margin, 1 - 1e-9)
  return to_elo(mean), (to_elo(high) - to_elo(low)) / 2


def describe(info):
  verdict = 'PASSED' if info['passed'] else 'FAILED' if info['failed'] else 'STOPPED'
  if info.get('deleted'):
    verdict = 'DELETED'
  elo = penta_elo(info['penta']) if info.get('penta') else None
  elo_text = '%+.1f +- %.1f Elo, ' % elo if elo else ''
  title = '#%d %s %s' % (info['id'], info['name'], verdict)
  body = '%s%d games, LLR %.2f [%.2f, %.2f]' % (
    elo_text, info['games'], info['currentllr'], info['lowerllr'], info['upperllr'])
  if verdict == 'STOPPED' and info['games'] == 0:
    body = 'Stopped before any games, likely a bench error. Check the Events page.'
  priority = 'high' if verdict in ('PASSED', 'FAILED') else 'urgent'
  tag = 'white_check_mark' if verdict == 'PASSED' else 'x' if verdict == 'FAILED' else 'warning'
  return title, body, priority, tag


def notify(config, title, body, priority, tag, dry_run):
  if dry_run or not config['topic']:
    log('NOTIFY (not sent%s): %s | %s' % (', dry run' if dry_run else ', no topic configured', title, body))
    return
  request = urllib.request.Request(
    'https://ntfy.sh/%s' % config['topic'], data=body.encode('utf-8'), method='POST',
    headers={'User-Agent': USER_AGENT, 'Title': title, 'Priority': priority, 'Tags': tag, 'Click': '%s/test/%s' % (config['base_url'], title[1:].split()[0])})
  with urllib.request.urlopen(request, timeout=20) as response:
    log('NOTIFY sent (%d): %s | %s' % (response.status, title, body))


def watched(config, info):
  return not config['authors'] or info['author'] in config['authors']


def seed_state(config):
  watching, workload_id = [], SEED_PROBE_START
  while True:
    info = fetch_info(config, workload_id)
    if info is None:
      break
    if watched(config, info) and not info['finished']:
      watching.append(workload_id)
    workload_id += 1
  log('seeded state: next_id=%d, already running: %s' % (workload_id, watching))
  return {'next_id': workload_id, 'watching': watching}


def poll_once(config, state, dry_run):
  new_ids = []
  while True:
    info = fetch_info(config, state['next_id'])
    if info is None:
      break
    if watched(config, info):
      new_ids.append(state['next_id'])
    state['next_id'] += 1
  state['watching'] += new_ids

  still_watching, notified = [], 0
  for workload_id in state['watching']:
    info = fetch_info(config, workload_id)
    if info is None or info['finished'] or info.get('deleted'):
      if info is not None and not info.get('deleted'):
        notify(config, *describe(info), dry_run)
        notified += 1
    else:
      still_watching.append(workload_id)
  state['watching'] = still_watching
  log('poll: new=%s watching=%s notified=%d' % (new_ids, still_watching, notified))


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--dry-run', action='store_true', help='print notifications instead of sending them')
  parser.add_argument('--once', action='store_true', help='poll one time and exit')
  parser.add_argument('--test-push', action='store_true', help='send a test notification and exit')
  parser.add_argument('--describe', type=int, metavar='ID', help='print the notification for a test id and exit')
  args = parser.parse_args()

  config = load_config()
  log('config: base_url=%s authors=%s interval=%ds topic=%s' % (
    config['base_url'], config['authors'] or 'everyone', config['interval'], 'set' if config['topic'] else 'MISSING'))

  if args.test_push:
    notify(config, 'ob-notify test', 'If you can read this, push notifications work.', 'default', 'tada', args.dry_run)
    return
  if args.describe:
    info = fetch_info(config, args.describe)
    print(describe(info) if info else 'no such test')
    return

  state = load_state()
  while True:
    try:
      state = state or seed_state(config)
      poll_once(config, state, args.dry_run)
      save_state(state)
    except Exception as error:
      log('poll failed, will retry: %r' % (error,))
    if args.once:
      return
    time.sleep(config['interval'])


if __name__ == '__main__':
  main()
