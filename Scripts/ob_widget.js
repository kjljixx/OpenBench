// Scriptable (iOS) home-screen widget showing the latest OpenBench test of AUTHOR.
// Widget parameter: optional test id to pin, for example "198". Empty shows the newest test.
// Install: copy this file into Scriptable (or iCloud Drive/Scriptable/ob_widget.js), then add a Scriptable widget and choose this script.

const BASE_URL = "https://ob.kjljixx.com";
const AUTHOR = "kjljixx";
const SEED_ID = 198;
const KEYCHAIN_KEY = "ob_widget_last_id";
const REFRESH_MINUTES = 5;

async function fetchInfo(id) {
  const request = new Request(`${BASE_URL}/api/workload/${id}/info/`);
  request.method = "POST";
  const body = await request.loadJSON();
  return body.info || null;
}

async function newestOwnTest() {
  let lastId = Keychain.contains(KEYCHAIN_KEY) ? parseInt(Keychain.get(KEYCHAIN_KEY)) : SEED_ID;
  while (await fetchInfo(lastId + 1)) lastId++;
  Keychain.set(KEYCHAIN_KEY, String(lastId));

  for (let id = lastId; id >= Math.max(lastId - 30, 1); id--) {
    const info = await fetchInfo(id);
    if (info && info.author === AUTHOR && !info.deleted) return info;
  }
  return null;
}

function pentaElo(penta) {
  const games = penta.reduce((a, b) => a + b, 0);
  if (games === 0) return null;
  const scores = [0, 0.25, 0.5, 0.75, 1];
  const mean = penta.reduce((sum, count, i) => sum + count * scores[i], 0) / games;
  if (mean <= 0 || mean >= 1) return null;
  const variance = penta.reduce((sum, count, i) => sum + count * (scores[i] - mean) ** 2, 0) / games;
  const toElo = (x) => -400 * Math.log10(1 / x - 1);
  const margin = 1.96 * Math.sqrt(variance / games);
  const low = Math.max(mean - margin, 1e-9);
  const high = Math.min(mean + margin, 1 - 1e-9);
  return { elo: toElo(mean), error: (toElo(high) - toElo(low)) / 2 };
}

function status(info) {
  if (info.passed) return { text: "PASSED", color: new Color("#30d158") };
  if (info.failed) return { text: "FAILED", color: new Color("#ff453a") };
  if (info.finished) return { text: "STOPPED", color: new Color("#ff9f0a") };
  return { text: "RUNNING", color: new Color("#0a84ff") };
}

function llrBar(info, width, height, color) {
  const context = new DrawContext();
  context.size = new Size(width, height);
  context.opaque = false;
  context.respectScreenScale = true;
  context.setFillColor(new Color("#ffffff", 0.15));
  context.fillRect(new Rect(0, 0, width, height));

  const span = info.upperllr - info.lowerllr;
  const fraction = Math.min(Math.max((info.currentllr - info.lowerllr) / span, 0), 1);
  context.setFillColor(color);
  context.fillRect(new Rect(0, 0, width * fraction, height));

  context.setFillColor(new Color("#ffffff", 0.6));
  const zeroX = width * (-info.lowerllr / span);
  context.fillRect(new Rect(zeroX - 0.5, 0, 1, height));
  return context.getImage();
}

function addLine(widget, text, size, color, bold) {
  const line = widget.addText(text);
  line.textColor = color;
  line.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  line.lineLimit = 1;
  line.minimumScaleFactor = 0.6;
  return line;
}

async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#1c1c1e");
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  const white = Color.white();
  const grey = new Color("#8e8e93");

  const pinned = args.widgetParameter ? parseInt(args.widgetParameter) : null;
  let info;
  try {
    info = pinned ? await fetchInfo(pinned) : await newestOwnTest();
  } catch (error) {
    addLine(widget, "OpenBench unreachable", 14, new Color("#ff453a"), true);
    addLine(widget, String(error), 10, grey, false);
    return widget;
  }
  if (!info) {
    addLine(widget, "No test found", 14, grey, true);
    return widget;
  }

  const state = status(info);
  const elo = info.penta ? pentaElo(info.penta) : null;

  addLine(widget, `#${info.id}  ${state.text}`, 12, state.color, true);
  addLine(widget, info.name, 15, white, true);
  widget.addSpacer(6);
  addLine(widget, elo ? `${elo.elo >= 0 ? "+" : ""}${elo.elo.toFixed(1)} ± ${elo.error.toFixed(1)} Elo` : "no games yet", 18, white, true);
  widget.addSpacer(4);
  const bar = widget.addImage(llrBar(info, 300, 8, state.color));
  bar.imageSize = new Size(140, 6);
  addLine(widget, `LLR ${info.currentllr.toFixed(2)}  [${info.lowerllr.toFixed(2)}, ${info.upperllr.toFixed(2)}]`, 10, grey, false);
  addLine(widget, `${info.games.toLocaleString()} games`, 10, grey, false);
  widget.url = `${BASE_URL}/test/${info.id}/`;
  return widget;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();
